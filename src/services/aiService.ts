import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { Candidate } from '../models/Candidate';
import { ResumeScreening, IResumeScreening } from '../models/ResumeScreening';
import { AiUsageLog } from '../models/AiUsageLog';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { Attendance } from '../models/Attendance';
import { LeaveRequest } from '../models/LeaveRequest';
import { Appraisal } from '../models/Appraisal';
import { DisciplinaryAction } from '../models/DisciplinaryAction';
import { EmployeeQuery } from '../models/EmployeeQuery';
import { EmployeeAiSummary, IEmployeeAiSummary } from '../models/EmployeeAiSummary';
import { PlatformAiProvider } from '../models/PlatformAiProvider';
import { Interview } from '../models/Interview';
import { ManpowerRequest } from '../models/ManpowerRequest';
import { callAiJson, AiProviderName, JsonSchemaDef } from './aiProviders';
import { toSignedCloudinaryUrl } from '../utils/cloudinarySign';
import { getOrCreatePipelineState } from '../utils/hiringPipelineHelpers';
const MAX_RESUME_CHARS = 32_000;

const MODEL_PRICING: Record<string, { promptPer1k: number; completionPer1k: number }> = {
  'gpt-4o-mini': { promptPer1k: 0.00015, completionPer1k: 0.0006 },
  'gemini-2.5-flash': { promptPer1k: 0.0001, completionPer1k: 0.0004 }, // free tier covers most usage
  'claude-3-5-haiku-20241022': { promptPer1k: 0.0008, completionPer1k: 0.004 },
};

interface ResolvedAiProvider {
  provider: AiProviderName;
  apiKey: string;
  model: string;
}
const resolveTenantAiProvider = async (tenantId: string): Promise<ResolvedAiProvider | null> => {
  const tenant = await Tenant.findById(tenantId).select('preferredAiProvider');
  const preferred = tenant?.preferredAiProvider;

  const doc = preferred
    ? await PlatformAiProvider.findOne({ tenantId, provider: preferred, isActive: true })
    : await PlatformAiProvider.findOne({ tenantId, isActive: true }).sort({ provider: 1 });

  if (!doc) return null;
  const apiKey = doc.getDecryptedApiKey();
  if (!apiKey) return null;

  return { provider: doc.provider, apiKey, model: doc.modelName };
};

const NOT_CONFIGURED_MESSAGE = 'No AI provider is active for this account — contact your administrator.';

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
    .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, '[pan]')
    .replace(/\b\d{9,18}\b/g, '[account-number]');

const fetchFileBuffer = async (fileUrl: string): Promise<Buffer> => {
  const response = await fetch(toSignedCloudinaryUrl(fileUrl));
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
  pros: string[];
  cons: string[];
  starRating: number;
}

const SCREENING_JSON_SCHEMA: JsonSchemaDef = {
  name: 'resume_screening',
  schema: {
    type: 'object',
    properties: {
      fitScore: { type: 'number', description: '0-100 fit score against the job role' },
      matchedSkills: { type: 'array', items: { type: 'string' } },
      missingSkills: { type: 'array', items: { type: 'string' } },
      experienceMatch: { type: 'string', enum: ['under', 'match', 'over'] },
      redFlags: { type: 'array', items: { type: 'string' }, description: 'Gaps, inconsistent dates, etc.' },
      summary: { type: 'string', description: 'Short plain-English summary for the HR reviewer' },
      pros: { type: 'array', items: { type: 'string' }, description: 'Concrete strengths of this candidate for this role' },
      cons: { type: 'array', items: { type: 'string' }, description: 'Concrete weaknesses or gaps for this role' },
      starRating: { type: 'integer', description: 'Overall hiring recommendation strength, 1 (poor fit) to 5 (excellent fit)' },
    },
    required: ['fitScore', 'matchedSkills', 'missingSkills', 'experienceMatch', 'redFlags', 'summary', 'pros', 'cons', 'starRating'],
    additionalProperties: false,
  },
};

const callScreeningAi = async (
  resolved: ResolvedAiProvider,
  jobRole: string,
  resumeText: string,
): Promise<{ result: ScreeningResult; promptTokens: number; completionTokens: number; model: string }> => {
  const { raw, promptTokens, completionTokens } = await callAiJson({
    provider: resolved.provider,
    apiKey: resolved.apiKey,
    model: resolved.model,
    systemPrompt:
      'You are an HR resume-screening assistant. You produce an advisory fit assessment only — ' +
      'you never decide whether a candidate is accepted or rejected, you only describe fit. ' +
      'Be specific and evidence-based; do not penalize non-standard formats, career gaps, or names/schools ' +
      'that are not from well-known institutions.',
    userPrompt: `Job role: ${jobRole}\n\nResume text (PII redacted):\n${resumeText}`,
    jsonSchema: SCREENING_JSON_SCHEMA,
  });

  const result = JSON.parse(raw) as ScreeningResult;
  return { result, promptTokens, completionTokens, model: resolved.model };
};
export const screenResume = async (
  tenantId: string,
  candidateId: string,
  triggeredBy: string,
): Promise<IResumeScreening> => {
  const candidate = await Candidate.findOne({ _id: candidateId, tenantId });
  if (!candidate) throw new AiFeatureError('Candidate not found', 404);
  if (!candidate.resumeUrl) throw new AiFeatureError('Candidate has no resume uploaded', 400);

  const resolved = await resolveTenantAiProvider(tenantId);
  if (!resolved) throw new AiFeatureError(NOT_CONFIGURED_MESSAGE, 400);

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
    const { result, promptTokens, completionTokens, model } = await callScreeningAi(resolved, candidate.jobRole, redactedText);
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
      pros: result.pros,
      cons: result.cons,
      starRating: Math.max(1, Math.min(5, Math.round(result.starRating))),
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
const SUMMARY_WINDOW_DAYS = 90;

interface EmployeeSummaryResult {
  summary: string;
}

const EMPLOYEE_SUMMARY_JSON_SCHEMA: JsonSchemaDef = {
  name: 'employee_summary',
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

const callEmployeeSummaryAi = async (
  resolved: ResolvedAiProvider,
  employeeName: string,
  dataPoints: string,
): Promise<{ result: EmployeeSummaryResult; promptTokens: number; completionTokens: number; model: string }> => {
  const { raw, promptTokens, completionTokens } = await callAiJson({
    provider: resolved.provider,
    apiKey: resolved.apiKey,
    model: resolved.model,
    systemPrompt:
      'You are an HR assistant summarizing one employee\'s record for their manager. You produce an ' +
      'advisory, factual summary only — you never recommend disciplinary action, promotion, or ' +
      'termination, you only describe what happened. Be neutral and evidence-based.',
    userPrompt: `Employee: ${employeeName}\n\nRecord (last ${SUMMARY_WINDOW_DAYS} days unless noted):\n${dataPoints}`,
    jsonSchema: EMPLOYEE_SUMMARY_JSON_SCHEMA,
  });

  const result = JSON.parse(raw) as EmployeeSummaryResult;
  return { result, promptTokens, completionTokens, model: resolved.model };
};
export const generateEmployeeSummary = async (
  tenantId: string,
  employeeId: string,
  triggeredBy: string,
): Promise<IEmployeeAiSummary> => {
  const employee = await User.findOne({ _id: employeeId, tenantId } as any);
  if (!employee) throw new AiFeatureError('Employee not found', 404);

  const resolved = await resolveTenantAiProvider(tenantId);
  if (!resolved) throw new AiFeatureError(NOT_CONFIGURED_MESSAGE, 400);

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
    const { result, promptTokens, completionTokens, model } = await callEmployeeSummaryAi(
      resolved, `${employee.firstName} ${employee.lastName}`, dataPoints,
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

interface RoleContext {
  jobTitle: string;
  designation?: string;
  departmentName?: string;
}

interface JdGenerationResult {
  jobDescriptionSummary: string;
  keyResponsibilities: string[];
  qualificationReq: string;
  experienceReq: string;
  technicalSkills: string;
  softSkills: string;
}

const JD_JSON_SCHEMA: JsonSchemaDef = {
  name: 'job_description',
  schema: {
    type: 'object',
    properties: {
      jobDescriptionSummary: { type: 'string', description: 'A 2-4 sentence summary of the role' },
      keyResponsibilities: { type: 'array', items: { type: 'string' }, description: '5-8 concrete day-to-day responsibilities' },
      qualificationReq: { type: 'string', description: 'Required education/qualifications' },
      experienceReq: { type: 'string', description: 'Required years/type of experience' },
      technicalSkills: { type: 'string', description: 'Comma-separated technical skills' },
      softSkills: { type: 'string', description: 'Comma-separated soft skills' },
    },
    required: ['jobDescriptionSummary', 'keyResponsibilities', 'qualificationReq', 'experienceReq', 'technicalSkills', 'softSkills'],
    additionalProperties: false,
  },
};

const buildRoleLine = (role: RoleContext) =>
  `Job title: ${role.jobTitle}${role.designation ? `\nDesignation: ${role.designation}` : ''}${role.departmentName ? `\nDepartment: ${role.departmentName}` : ''}`;

/**
 * On-demand JD drafting for a Manpower Request — HR can edit the result before
 * saving, and optionally save it into JdLibrary for reuse. No PII/resume involved,
 * so no stripPii step (unlike screenResume).
 */
export const generateJobDescription = async (
  tenantId: string,
  role: RoleContext,
  triggeredBy: string,
): Promise<JdGenerationResult> => {
  const resolved = await resolveTenantAiProvider(tenantId);
  if (!resolved) throw new AiFeatureError(NOT_CONFIGURED_MESSAGE, 400);

  try {
    const { raw, promptTokens, completionTokens } = await callAiJson({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.model,
      systemPrompt:
        'You are an HR assistant drafting a job description for a manpower requisition. Be concrete and ' +
        'realistic for the given role; do not invent company-specific details you were not given.',
      userPrompt: `${buildRoleLine(role)}\n\nDraft a job description for this role.`,
      jsonSchema: JD_JSON_SCHEMA,
    });
    const result = JSON.parse(raw) as JdGenerationResult;

    const pricing = MODEL_PRICING[resolved.model] ?? { promptPer1k: 0, completionPer1k: 0 };
    const costUsd = (promptTokens / 1000) * pricing.promptPer1k + (completionTokens / 1000) * pricing.completionPer1k;
    await AiUsageLog.create({
      tenantId, feature: 'jd-generation', aiModel: resolved.model,
      promptTokens, completionTokens, totalTokens: promptTokens + completionTokens,
      costUSD: costUsd, costINR: costUsd * 83, status: 'SUCCESS',
      createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    await Tenant.updateOne({ _id: tenantId }, { $inc: { aiCredits: -1 } });

    return result;
  } catch (err: any) {
    await AiUsageLog.create({
      tenantId, feature: 'jd-generation', status: 'FAILURE',
      metadata: { error: err.message }, createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    throw err instanceof AiFeatureError ? err : new AiFeatureError('AI JD generation failed', 502);
  }
};

interface KpaGenerationResult {
  kraReport: string;
  kpis: string[];
}

const KPA_JSON_SCHEMA: JsonSchemaDef = {
  name: 'kpa_generation',
  schema: {
    type: 'object',
    properties: {
      kraReport: { type: 'string', description: 'A short narrative of the key result areas for this role' },
      kpis: { type: 'array', items: { type: 'string' }, description: '4-6 concrete, measurable KPIs for this role' },
    },
    required: ['kraReport', 'kpis'],
    additionalProperties: false,
  },
};

/** On-demand KRA/KPA drafting for a Manpower Request — same shape as generateJobDescription. */
export const generateKpa = async (
  tenantId: string,
  role: RoleContext,
  triggeredBy: string,
): Promise<KpaGenerationResult> => {
  const resolved = await resolveTenantAiProvider(tenantId);
  if (!resolved) throw new AiFeatureError(NOT_CONFIGURED_MESSAGE, 400);

  try {
    const { raw, promptTokens, completionTokens } = await callAiJson({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.model,
      systemPrompt:
        'You are an HR assistant drafting Key Result Areas (KRA) and Key Performance Indicators (KPI) for ' +
        'a manpower requisition. Be concrete and measurable; do not invent company-specific targets.',
      userPrompt: `${buildRoleLine(role)}\n\nDraft the KRA/KPIs for this role.`,
      jsonSchema: KPA_JSON_SCHEMA,
    });
    const result = JSON.parse(raw) as KpaGenerationResult;

    const pricing = MODEL_PRICING[resolved.model] ?? { promptPer1k: 0, completionPer1k: 0 };
    const costUsd = (promptTokens / 1000) * pricing.promptPer1k + (completionTokens / 1000) * pricing.completionPer1k;
    await AiUsageLog.create({
      tenantId, feature: 'kpa-generation', aiModel: resolved.model,
      promptTokens, completionTokens, totalTokens: promptTokens + completionTokens,
      costUSD: costUsd, costINR: costUsd * 83, status: 'SUCCESS',
      createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    await Tenant.updateOne({ _id: tenantId }, { $inc: { aiCredits: -1 } });

    return result;
  } catch (err: any) {
    await AiUsageLog.create({
      tenantId, feature: 'kpa-generation', status: 'FAILURE',
      metadata: { error: err.message }, createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    throw err instanceof AiFeatureError ? err : new AiFeatureError('AI KPA generation failed', 502);
  }
};

interface InterviewQuestionsResult {
  questions: string[];
}

const INTERVIEW_QUESTIONS_JSON_SCHEMA: JsonSchemaDef = {
  name: 'interview_questions',
  schema: {
    type: 'object',
    properties: {
      questions: { type: 'array', items: { type: 'string' }, description: '8-10 interview questions tailored to this round' },
    },
    required: ['questions'],
    additionalProperties: false,
  },
};

/** What each round should actually probe for — shapes question depth/focus, not just topic. */
const ROUND_GUIDANCE: Record<string, string> = {
  'Walk-In': 'Basic screening: confirm background accuracy, availability, and immediate fit. Keep questions simple and quick to answer.',
  Telephonic: 'First-call screening: communication clarity, motivation, notice period, and a few high-level skill-check questions.',
  Technical: 'Deep technical assessment: probe hands-on depth in the listed technical skills, problem-solving, and real scenarios from the responsibilities.',
  HR: 'Behavioral and culture fit: past conduct, teamwork, conflict handling, and soft-skill scenarios.',
  'HR & HOD': 'Combined behavioral + role fit: culture fit alongside whether their experience matches the qualification/experience requirements.',
  Managerial: 'Ownership and leadership: decision-making, prioritization, stakeholder handling, and how they would approach the key responsibilities.',
  Final: 'Closing round: career goals, compensation expectations, long-term fit, and any open concerns before an offer.',
};

/**
 * Generates round-appropriate interview questions for one scheduled Interview, using
 * whatever JD/skills context is available from the manpower requisition that justified
 * this candidate's hire (resolved via the candidate's pipeline state refId — same link
 * createCandidate() established). Falls back to just the candidate's job role if no
 * requisition is found. Persists onto the Interview doc so reopening it doesn't require
 * regenerating (the "Regenerate" action explicitly re-runs this).
 */
export const generateInterviewQuestions = async (
  tenantId: string,
  interviewId: string,
  triggeredBy: string,
): Promise<InterviewQuestionsResult> => {
  const resolved = await resolveTenantAiProvider(tenantId);
  if (!resolved) throw new AiFeatureError(NOT_CONFIGURED_MESSAGE, 400);

  const interview = await Interview.findOne({ _id: interviewId, tenantId } as any).populate('candidateId', 'firstName lastName jobRole');
  if (!interview) throw new AiFeatureError('Interview not found', 404);
  const candidate = interview.candidateId as any;

  let manpowerContext = '';
  const pipelineState = await getOrCreatePipelineState(tenantId, String(candidate?._id || ''));
  const manpowerStep = pipelineState?.steps.find((s) => s.key === 'manpowerRequest');
  if (manpowerStep?.refId) {
    const manpowerRequest = await ManpowerRequest.findOne({ _id: manpowerStep.refId, tenantId } as any);
    if (manpowerRequest) {
      manpowerContext = [
        manpowerRequest.jobDescriptionSummary && `Job description: ${manpowerRequest.jobDescriptionSummary}`,
        manpowerRequest.keyResponsibilities?.length && `Key responsibilities: ${manpowerRequest.keyResponsibilities.join('; ')}`,
        manpowerRequest.qualificationReq && `Qualification required: ${manpowerRequest.qualificationReq}`,
        manpowerRequest.experienceReq && `Experience required: ${manpowerRequest.experienceReq}`,
        manpowerRequest.technicalSkills && `Technical skills: ${manpowerRequest.technicalSkills}`,
        manpowerRequest.softSkills && `Soft skills: ${manpowerRequest.softSkills}`,
      ].filter(Boolean).join('\n');
    }
  }

  try {
    const roundType = interview.roundType;
    const userPrompt = [
      `Candidate: ${candidate?.firstName || ''} ${candidate?.lastName || ''}`.trim(),
      `Role: ${candidate?.jobRole || 'Unknown role'}`,
      `Interview round: ${roundType}`,
      `Round focus: ${ROUND_GUIDANCE[roundType] || 'General fit and skills assessment.'}`,
      manpowerContext || 'No additional job description/skills context is available — base questions on the role title alone.',
      '\nWrite interview questions for this specific round only — do not duplicate what earlier or later rounds would already cover.',
    ].join('\n');

    const { raw, promptTokens, completionTokens } = await callAiJson({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.model,
      systemPrompt: 'You are an experienced interview panelist preparing questions for one specific interview round. Be concrete and specific to the role and skills given.',
      userPrompt,
      jsonSchema: INTERVIEW_QUESTIONS_JSON_SCHEMA,
    });
    const result = JSON.parse(raw) as InterviewQuestionsResult;

    interview.interviewQuestions = result.questions;
    await interview.save();

    const pricing = MODEL_PRICING[resolved.model] ?? { promptPer1k: 0, completionPer1k: 0 };
    const costUsd = (promptTokens / 1000) * pricing.promptPer1k + (completionTokens / 1000) * pricing.completionPer1k;
    await AiUsageLog.create({
      tenantId, feature: 'interview-question-generation', aiModel: resolved.model,
      promptTokens, completionTokens, totalTokens: promptTokens + completionTokens,
      costUSD: costUsd, costINR: costUsd * 83, status: 'SUCCESS',
      createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    await Tenant.updateOne({ _id: tenantId }, { $inc: { aiCredits: -1 } });

    return result;
  } catch (err: any) {
    await AiUsageLog.create({
      tenantId, feature: 'interview-question-generation', status: 'FAILURE',
      metadata: { error: err.message }, createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    throw err instanceof AiFeatureError ? err : new AiFeatureError('AI interview question generation failed', 502);
  }
};
