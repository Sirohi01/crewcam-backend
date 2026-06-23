import OpenAI from 'openai';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { Candidate } from '../models/Candidate';
import { ResumeScreening, IResumeScreening } from '../models/ResumeScreening';
import { Integration } from '../models/Integration';
import { AiUsageLog } from '../models/AiUsageLog';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { Attendance } from '../models/Attendance';
import { LeaveRequest } from '../models/LeaveRequest';
import { Appraisal } from '../models/Appraisal';
import { DisciplinaryAction } from '../models/DisciplinaryAction';
import { EmployeeQuery } from '../models/EmployeeQuery';
import { EmployeeAiSummary, IEmployeeAiSummary } from '../models/EmployeeAiSummary';

// Resume text cap before sending to the model — per docs/hiring/12_AI_RESUME_SCREENING.md §5,
// an oversized resume is rejected outright rather than silently truncated (truncation could
// drop the most relevant section and produce a misleading score).
const MAX_RESUME_CHARS = 32_000; // ~8k tokens at ~4 chars/token

// Illustrative per-token USD rates — confirm against OpenAI's current pricing page before
// this reaches production billing; AiUsageLog.costUsd is informational/cost-tracking, not
// an invoice generator.
const MODEL_PRICING: Record<string, { promptPer1k: number; completionPer1k: number }> = {
  'gpt-4o-mini': { promptPer1k: 0.00015, completionPer1k: 0.0006 },
};
const DEFAULT_MODEL = process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini';

export class AiFeatureError extends Error {
  constructor(message: string, public readonly statusCode: number = 422) {
    super(message);
  }
}

export const stripPii = (text: string): string =>
  text
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]')
    .replace(/\b\+?\d[\d\s-]{8,14}\d\b/g, '[phone]')
    .replace(/\b[2-9]{1}[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b/g, '[aadhaar]') // 12-digit Aadhaar pattern
    .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, '[pan]') // PAN pattern
    .replace(/\b\d{9,18}\b/g, '[account-number]'); // bank account-like long digit runs

const fetchFileBuffer = async (fileUrl: string): Promise<Buffer> => {
  const response = await fetch(fileUrl);
  if (!response.ok) throw new AiFeatureError(`Could not fetch resume file (HTTP ${response.status})`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

export const extractResumeText = async (fileUrl: string): Promise<string> => {
  const buffer = await fetchFileBuffer(fileUrl);
  const lowerUrl = fileUrl.toLowerCase();

  if (lowerUrl.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  // Default to PDF — uploadRoutes.ts's fileFilter only allows PDF/DOCX/image/CSV/XLSX,
  // and a resume is realistically PDF or DOCX.
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text.trim();
  } finally {
    await parser.destroy();
  }
};

interface ScreeningResult {
  fitScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  experienceMatch: 'under' | 'match' | 'over';
  redFlags: string[];
  summary: string;
}

const SCREENING_JSON_SCHEMA = {
  name: 'resume_screening',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      fitScore: { type: 'number', description: '0-100 fit score against the job role' },
      matchedSkills: { type: 'array', items: { type: 'string' } },
      missingSkills: { type: 'array', items: { type: 'string' } },
      experienceMatch: { type: 'string', enum: ['under', 'match', 'over'] },
      redFlags: { type: 'array', items: { type: 'string' }, description: 'Gaps, inconsistent dates, etc.' },
      summary: { type: 'string', description: 'Short plain-English summary for the HR reviewer' },
    },
    required: ['fitScore', 'matchedSkills', 'missingSkills', 'experienceMatch', 'redFlags', 'summary'],
    additionalProperties: false,
  },
};

const callOpenAi = async (
  apiKey: string,
  jobRole: string,
  resumeText: string,
): Promise<{ result: ScreeningResult; promptTokens: number; completionTokens: number; model: string }> => {
  const client = new OpenAI({ apiKey });
  const model = DEFAULT_MODEL;

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are an HR resume-screening assistant. You produce an advisory fit assessment only — ' +
          'you never decide whether a candidate is accepted or rejected, you only describe fit. ' +
          'Be specific and evidence-based; do not penalize non-standard formats, career gaps, or names/schools ' +
          'that are not from well-known institutions.',
      },
      {
        role: 'user',
        content: `Job role: ${jobRole}\n\nResume text (PII redacted):\n${resumeText}`,
      },
    ],
    response_format: { type: 'json_schema', json_schema: SCREENING_JSON_SCHEMA },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new AiFeatureError('AI returned an empty response', 502);

  const result = JSON.parse(raw) as ScreeningResult;
  return {
    result,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
    model,
  };
};

/**
 * Advisory-only resume screening. Never mutates Candidate.status — per
 * docs/02_ARCHITECTURE_AND_SECURITY_BASELINE.md rule #4, the fit score is surfaced to HR,
 * the human decides. Fails closed: any extraction/AI error produces a 'failed'
 * ResumeScreening row, never a silent advance or a guessed score.
 */
export const screenResume = async (
  tenantId: string,
  candidateId: string,
  triggeredBy: string,
): Promise<IResumeScreening> => {
  const candidate = await Candidate.findOne({ _id: candidateId, tenantId });
  if (!candidate) throw new AiFeatureError('Candidate not found', 404);
  if (!candidate.resumeUrl) throw new AiFeatureError('Candidate has no resume uploaded', 400);

  const integration = await Integration.findOne({ tenantId, provider: 'OpenAI', isActive: true });
  const apiKey = integration?.getDecryptedCredentials()?.apiKey;
  if (!apiKey) throw new AiFeatureError('OpenAI is not configured for this tenant (Settings > Integrations)', 400);

  let extractedText: string;
  try {
    extractedText = await extractResumeText(candidate.resumeUrl);
  } catch (err: any) {
    await ResumeScreening.create({
      tenantId, candidateId, extractedText: '', status: 'failed',
      failureReason: `Resume text extraction failed: ${err.message}`,
      createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    throw new AiFeatureError('Could not read the candidate\'s resume file', 422);
  }

  if (!extractedText) {
    await ResumeScreening.create({
      tenantId, candidateId, extractedText: '', status: 'failed',
      failureReason: 'Resume contained no extractable text',
      createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    throw new AiFeatureError('Resume contained no extractable text', 422);
  }

  if (extractedText.length > MAX_RESUME_CHARS) {
    await ResumeScreening.create({
      tenantId, candidateId, extractedText, status: 'failed',
      failureReason: `Resume text exceeds the ${MAX_RESUME_CHARS}-character cap — rejected rather than truncated`,
      createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    throw new AiFeatureError('Resume is too long to screen safely; please trim and re-upload', 413);
  }

  const redactedText = stripPii(extractedText);

  try {
    const { result, promptTokens, completionTokens, model } = await callOpenAi(apiKey, candidate.jobRole, redactedText);
    const pricing = MODEL_PRICING[model] ?? { promptPer1k: 0, completionPer1k: 0 };
    const costUsd = (promptTokens / 1000) * pricing.promptPer1k + (completionTokens / 1000) * pricing.completionPer1k;

    const screening = await ResumeScreening.create({
      tenantId, candidateId, extractedText,
      fitScore: Math.max(0, Math.min(100, Math.round(result.fitScore))),
      matchedSkills: result.matchedSkills,
      missingSkills: result.missingSkills,
      experienceMatch: result.experienceMatch,
      redFlags: result.redFlags,
      summary: result.summary,
      modelUsed: model,
      promptTokens, completionTokens, costUsd,
      status: 'completed',
      createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);

    await AiUsageLog.create({
      tenantId, candidateId, feature: 'resume-screening', aiModel: model,
      promptTokens, completionTokens, totalTokens: promptTokens + completionTokens,
      costUSD: costUsd, costINR: costUsd * 83, status: 'SUCCESS',
      createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);

    await Tenant.updateOne({ _id: tenantId }, { $inc: { aiCredits: -1 } });

    return screening;
  } catch (err: any) {
    await ResumeScreening.create({
      tenantId, candidateId, extractedText, status: 'failed',
      failureReason: `AI call failed: ${err.message}`,
      createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    await AiUsageLog.create({
      tenantId, candidateId, feature: 'resume-screening', status: 'FAILURE',
      metadata: { error: err.message },
      createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    throw err instanceof AiFeatureError ? err : new AiFeatureError('AI screening call failed', 502);
  }
};

// On-demand only — never a background job re-analyzing every employee continuously
// (cheap to abuse credits, and edges into "AI surveilling employees" the baseline avoids).
const SUMMARY_WINDOW_DAYS = 90;

interface EmployeeSummaryResult {
  summary: string;
}

const EMPLOYEE_SUMMARY_JSON_SCHEMA = {
  name: 'employee_summary',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'A short, plain-English narrative covering attendance, leave, performance and disciplinary history, for an HR/manager reader',
      },
    },
    required: ['summary'],
    additionalProperties: false,
  },
};

const callOpenAiForEmployeeSummary = async (
  apiKey: string,
  employeeName: string,
  dataPoints: string,
): Promise<{ result: EmployeeSummaryResult; promptTokens: number; completionTokens: number; model: string }> => {
  const client = new OpenAI({ apiKey });
  const model = DEFAULT_MODEL;

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are an HR assistant summarizing one employee\'s record for their manager. You produce an ' +
          'advisory, factual summary only — you never recommend disciplinary action, promotion, or ' +
          'termination, you only describe what happened. Be neutral and evidence-based.',
      },
      {
        role: 'user',
        content: `Employee: ${employeeName}\n\nRecord (last ${SUMMARY_WINDOW_DAYS} days unless noted):\n${dataPoints}`,
      },
    ],
    response_format: { type: 'json_schema', json_schema: EMPLOYEE_SUMMARY_JSON_SCHEMA },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new AiFeatureError('AI returned an empty response', 502);

  const result = JSON.parse(raw) as EmployeeSummaryResult;
  return {
    result,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
    model,
  };
};

/**
 * Advisory-only employee summary. Never recommends or triggers any action — it only
 * narrates existing records that the caller's role already had read access to
 * individually (attendance, leave, performance, disciplinary, queries). On-demand,
 * triggered by an explicit HR click, per docs/02_ARCHITECTURE_AND_SECURITY_BASELINE.md.
 */
export const generateEmployeeSummary = async (
  tenantId: string,
  employeeId: string,
  triggeredBy: string,
): Promise<IEmployeeAiSummary> => {
  const employee = await User.findOne({ _id: employeeId, tenantId } as any);
  if (!employee) throw new AiFeatureError('Employee not found', 404);

  const integration = await Integration.findOne({ tenantId, provider: 'OpenAI', isActive: true });
  const apiKey = integration?.getDecryptedCredentials()?.apiKey;
  if (!apiKey) throw new AiFeatureError('OpenAI is not configured for this tenant (Settings > Integrations)', 400);

  const since = new Date(Date.now() - SUMMARY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [attendanceRecords, leaveRequests, appraisals, disciplinaryActions, queries] = await Promise.all([
    Attendance.find({ tenantId, userId: employeeId, date: { $gte: since } } as any).select('status'),
    LeaveRequest.find({ tenantId, userId: employeeId, createdAt: { $gte: since } } as any).select('status'),
    Appraisal.find({ tenantId, employeeId } as any).sort({ createdAt: -1 }).limit(3).select('cycle selfRating hodRating hrRating status'),
    DisciplinaryAction.find({ tenantId, employeeId, date: { $gte: since } } as any).select('type reason status date'),
    EmployeeQuery.find({ tenantId, raisedBy: employeeId, createdAt: { $gte: since } } as any).select('status'),
  ]);

  const countBy = (records: { status: string }[], status: string) => records.filter((r) => r.status === status).length;

  const dataPoints = [
    `Attendance: ${countBy(attendanceRecords, 'Present')} present, ${countBy(attendanceRecords, 'Absent')} absent, ${countBy(attendanceRecords, 'Half-Day')} half-day.`,
    `Leave requests: ${leaveRequests.length} total — ${countBy(leaveRequests, 'Approved')} approved, ${countBy(leaveRequests, 'Rejected')} rejected, ${countBy(leaveRequests, 'Pending')} pending.`,
    `Recent performance cycles: ${appraisals.map((a) => `${a.cycle} (self ${a.selfRating ?? '-'}, HOD ${a.hodRating ?? '-'}, HR ${a.hrRating ?? '-'}, ${a.status})`).join('; ') || 'none recorded'}.`,
    `Disciplinary actions in window: ${disciplinaryActions.map((d) => `${d.type} on ${d.date.toISOString().slice(0, 10)} (${d.status}) — ${d.reason}`).join('; ') || 'none'}.`,
    `Employee queries raised: ${queries.length} (${countBy(queries, 'Resolved')} resolved).`,
  ].join('\n');

  try {
    const { result, promptTokens, completionTokens, model } = await callOpenAiForEmployeeSummary(
      apiKey, `${employee.firstName} ${employee.lastName}`, dataPoints,
    );
    const pricing = MODEL_PRICING[model] ?? { promptPer1k: 0, completionPer1k: 0 };
    const costUsd = (promptTokens / 1000) * pricing.promptPer1k + (completionTokens / 1000) * pricing.completionPer1k;

    const summaryDoc = await EmployeeAiSummary.create({
      tenantId, employeeId, windowDays: SUMMARY_WINDOW_DAYS,
      summaryText: result.summary, modelUsed: model, promptTokens, completionTokens, costUsd,
      status: 'completed', createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);

    await AiUsageLog.create({
      tenantId, feature: 'employee-summary', aiModel: model,
      promptTokens, completionTokens, totalTokens: promptTokens + completionTokens,
      costUSD: costUsd, costINR: costUsd * 83, status: 'SUCCESS',
      metadata: { employeeId }, createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);

    await Tenant.updateOne({ _id: tenantId }, { $inc: { aiCredits: -1 } });

    return summaryDoc;
  } catch (err: any) {
    await EmployeeAiSummary.create({
      tenantId, employeeId, windowDays: SUMMARY_WINDOW_DAYS, summaryText: '', status: 'failed',
      failureReason: `AI call failed: ${err.message}`, createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    await AiUsageLog.create({
      tenantId, feature: 'employee-summary', status: 'FAILURE',
      metadata: { employeeId, error: err.message }, createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    throw err instanceof AiFeatureError ? err : new AiFeatureError('AI summary call failed', 502);
  }
};
