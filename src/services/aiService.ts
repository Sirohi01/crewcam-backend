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
import { Interview, IInterview, IInterviewQuestion, IAnswerAnalysis } from '../models/Interview';
import { ManpowerRequest } from '../models/ManpowerRequest';
import { callAiJson, callGeminiMultimodal, PERMISSIVE_SAFETY_SETTINGS, AiProviderName, JsonSchemaDef } from './aiProviders';
import { toSignedCloudinaryUrl } from '../utils/cloudinarySign';
import { extractTextFromBuffer } from '../utils/documentText';
import { getOrCreatePipelineState } from '../utils/hiringPipelineHelpers';
import { isQuotaError, describeQuotaError } from '../utils/aiErrorClassifier';
const MAX_RESUME_CHARS = 32_000;
export const MODEL_PRICING: Record<string, { promptPer1k: number; completionPer1k: number }> = {
  'gpt-4o-mini': { promptPer1k: 0.00015, completionPer1k: 0.0006 },
  'gpt-4.1-mini': { promptPer1k: 0.0004, completionPer1k: 0.0016 },
  'gpt-4o': { promptPer1k: 0.0025, completionPer1k: 0.01 },
  'gpt-4.1': { promptPer1k: 0.002, completionPer1k: 0.008 },
  'gemini-2.5-flash': { promptPer1k: 0.0001, completionPer1k: 0.0004 }, // free tier covers most usage
  'gemini-2.5-flash-lite': { promptPer1k: 0.00005, completionPer1k: 0.0002 },
  'gemini-2.5-pro': { promptPer1k: 0.00125, completionPer1k: 0.005 },
  'claude-3-5-haiku-20241022': { promptPer1k: 0.0008, completionPer1k: 0.004 },
  'claude-haiku-4-5-20251001': { promptPer1k: 0.001, completionPer1k: 0.005 },
  'claude-sonnet-4-6': { promptPer1k: 0.003, completionPer1k: 0.015 },
  'claude-opus-4-8': { promptPer1k: 0.015, completionPer1k: 0.075 },
};

export interface ResolvedAiProvider {
  provider: AiProviderName;
  apiKey: string;
  model: string;
}
export const resolveAllTenantAiProviders = async (tenantId: string): Promise<ResolvedAiProvider[]> => {
  const tenant = await Tenant.findById(tenantId).select('preferredAiProvider');
  const preferred = tenant?.preferredAiProvider;

  // 1. Fetch tenant-specific active providers
  const tenantDocs = await PlatformAiProvider.find({ tenantId, isActive: true });
  // 2. Fetch SUPER_ADMIN active providers as platform defaults
  const superAdminDocs = await PlatformAiProvider.find({ tenantId: 'SUPER_ADMIN', isActive: true }).setOptions({ bypassTenantIsolation: true });

  // Merge: tenant docs take precedence over SUPER_ADMIN for the same provider
  const providerMap = new Map<string, any>();
  for (const doc of superAdminDocs) {
    providerMap.set(doc.provider, doc);
  }
  for (const doc of tenantDocs) {
    providerMap.set(doc.provider, doc);
  }

  const docs = Array.from(providerMap.values());

  // Sort preferred provider first if configured
  if (preferred) {
    docs.sort((a, b) => (a.provider === preferred ? -1 : b.provider === preferred ? 1 : 0));
  }

  const resolvedList: ResolvedAiProvider[] = [];
  for (const doc of docs) {
    let apiKey = doc.getDecryptedApiKey();
    // Allow .env override if provided (useful for local dev / quick fixes)
    if (doc.provider === 'OpenAI' && process.env.OPENAI_API_KEY) {
      apiKey = process.env.OPENAI_API_KEY;
    } else if (doc.provider === 'Gemini' && process.env.GEMINI_API_KEY) {
      apiKey = process.env.GEMINI_API_KEY;
    }
    if (apiKey) {
      resolvedList.push({ provider: doc.provider, apiKey, model: doc.modelName });
    }
  }

  // If no providers were in DB or OpenAI was missing, inject from .env if available
  if (process.env.OPENAI_API_KEY && !resolvedList.some(p => p.provider === 'OpenAI')) {
    resolvedList.push({ provider: 'OpenAI', apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o-mini' });
  }
  if (process.env.GEMINI_API_KEY && !resolvedList.some(p => p.provider === 'Gemini')) {
    resolvedList.push({ provider: 'Gemini', apiKey: process.env.GEMINI_API_KEY, model: 'gemini-2.5-flash' });
  }

  return resolvedList;
};

export const resolveTenantAiProvider = async (tenantId: string): Promise<ResolvedAiProvider | null> => {
  const providers = await resolveAllTenantAiProviders(tenantId);
  return providers[0] || null;
};

const NOT_CONFIGURED_MESSAGE = 'No AI provider is active for this account — contact your administrator.';

export class AiFeatureError extends Error {
  constructor(message: string, public readonly statusCode: number = 422, public readonly code?: string) {
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
  if (!fileUrl || !fileUrl.startsWith('http')) {
    throw new AiFeatureError(
      `Invalid resume URL — must be a public https URL, not "${(fileUrl || '').slice(0, 60)}"`,
      422,
    );
  }
  // Raw Cloudinary uploads are usually served publicly, so try the plain URL first — signing
  // (via toSignedCloudinaryUrl) depends on reconstructing the exact public_id Cloudinary
  // stored from the delivery URL, which doesn't always round-trip byte-for-byte (filenames
  // with spaces/punctuation), turning a working public file into a false 404. Only fall back
  // to a signed URL for tenants whose raw delivery genuinely is access-restricted.
  let response = await fetch(fileUrl);
  if (!response.ok) {
    const signedUrl = toSignedCloudinaryUrl(fileUrl);
    if (signedUrl !== fileUrl) response = await fetch(signedUrl);
  }
  if (!response.ok) throw new AiFeatureError(`Could not fetch resume file (HTTP ${response.status})`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

export const extractResumeText = async (fileUrl: string): Promise<string> => {
  const buffer = await fetchFileBuffer(fileUrl);
  const mimeType = fileUrl.toLowerCase().endsWith('.docx') || fileUrl.toLowerCase().endsWith('.doc')
    ? 'application/msword'
    : 'application/pdf';
  return extractTextFromBuffer(buffer, mimeType);
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

const buildManpowerContext = async (tenantId: string, candidateId: string, candidateDoc?: any): Promise<string> => {
  let refId: any = null;
  const pipelineState = await getOrCreatePipelineState(tenantId, candidateId);
  const manpowerStep = pipelineState?.steps.find((s) => s.key === 'manpowerRequest');
  if (manpowerStep?.refId) {
    refId = manpowerStep.refId;
  } else {
    const candidate = candidateDoc || await Candidate.findOne({ _id: candidateId, tenantId } as any);
    refId = candidate?.manpowerRequestId || candidate?.applicationDetails?.manpowerRequestId;
  }
  if (!refId) return '';

  const manpowerRequest = await ManpowerRequest.findOne({ _id: refId, tenantId } as any);
  if (!manpowerRequest) return '';

  return [
    manpowerRequest.jobTitle && `Target Job Title: ${manpowerRequest.jobTitle}`,
    manpowerRequest.jobDescriptionSummary && `Job Description: ${manpowerRequest.jobDescriptionSummary}`,
    manpowerRequest.detailedJustification && `Role Scope & Context: ${manpowerRequest.detailedJustification}`,
    manpowerRequest.keyResponsibilities?.length && `Key Responsibilities: ${manpowerRequest.keyResponsibilities.join('; ')}`,
    manpowerRequest.technicalSkills?.length && `Required Technical Skills: ${Array.isArray(manpowerRequest.technicalSkills) ? manpowerRequest.technicalSkills.join(', ') : manpowerRequest.technicalSkills}`,
    manpowerRequest.softSkills?.length && `Soft Skills: ${Array.isArray(manpowerRequest.softSkills) ? manpowerRequest.softSkills.join(', ') : manpowerRequest.softSkills}`,
    manpowerRequest.experienceReq && `Required Experience: ${manpowerRequest.experienceReq}`,
    manpowerRequest.qualificationReq && `Required Qualification: ${manpowerRequest.qualificationReq}`,
  ].filter(Boolean).join('\n');
};

const callScreeningAi = async (
  resolved: ResolvedAiProvider,
  jobRole: string,
  resumeText: string,
  manpowerContext: string,
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
    userPrompt: `Job role: ${jobRole}\n${manpowerContext ? `\nRole Requirements Context:\n${manpowerContext}\n` : ''}\nResume text (PII redacted):\n${resumeText}`,
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
  const manpowerContext = await buildManpowerContext(tenantId, candidateId);

  try {
    const { result, promptTokens, completionTokens, model } = await callScreeningAi(resolved, candidate.jobRole, redactedText, manpowerContext);
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
  /** Free-text extra guidance from the HR user — appended to the prompt, never replaces it. */
  customPrompt?: string;
}

interface JdKraGenerationResult {
  jobDescriptionSummary: string;
  keyResponsibilities: string[];
  qualificationReq: string;
  experienceReq: string;
  technicalSkills: string;
  softSkills: string;
  kraReport: string;
  kpis: string[];
}

const JD_KRA_JSON_SCHEMA: JsonSchemaDef = {
  name: 'job_description_and_kra',
  schema: {
    type: 'object',
    properties: {
      jobDescriptionSummary: { type: 'string', description: 'A 2-4 sentence summary of the role' },
      keyResponsibilities: { type: 'array', items: { type: 'string' }, description: '5-8 concrete day-to-day responsibilities' },
      qualificationReq: { type: 'string', description: 'Required education/qualifications' },
      experienceReq: { type: 'string', description: 'Required years/type of experience' },
      technicalSkills: { type: 'string', description: 'Comma-separated technical skills' },
      softSkills: { type: 'string', description: 'Comma-separated soft skills' },
      kraReport: { type: 'string', description: 'A short narrative of the key result areas for this role' },
      kpis: { type: 'array', items: { type: 'string' }, description: '4-6 concrete, measurable KPIs for this role' },
    },
    required: ['jobDescriptionSummary', 'keyResponsibilities', 'qualificationReq', 'experienceReq', 'technicalSkills', 'softSkills', 'kraReport', 'kpis'],
    additionalProperties: false,
  },
};

const buildRoleLine = (role: RoleContext) =>
  `Job title: ${role.jobTitle}${role.designation ? `\nDesignation: ${role.designation}` : ''}${role.departmentName ? `\nDepartment: ${role.departmentName}` : ''}` +
  (role.customPrompt ? `\n\nAdditional instructions from the requester: ${role.customPrompt}` : '');


export const generateJobDescriptionAndKra = async (
  tenantId: string,
  role: RoleContext,
  triggeredBy: string,
): Promise<JdKraGenerationResult> => {
  const resolved = await resolveTenantAiProvider(tenantId);
  if (!resolved) throw new AiFeatureError(NOT_CONFIGURED_MESSAGE, 400);

  try {
    const { raw, promptTokens, completionTokens } = await callAiJson({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.model,
      systemPrompt:
        'You are an HR assistant drafting a job description AND its Key Result Areas (KRA) / Key Performance ' +
        'Indicators (KPI) for a manpower requisition, in one pass so they stay consistent with each other. Be ' +
        'concrete and realistic for the given role; do not invent company-specific details you were not given. ' +
        'If the requester gave additional instructions, follow them while staying realistic for the role.',
      userPrompt: `${buildRoleLine(role)}\n\nDraft the job description and the KRA/KPIs for this role.`,
      jsonSchema: JD_KRA_JSON_SCHEMA,
    });
    const result = JSON.parse(raw) as JdKraGenerationResult;

    const pricing = MODEL_PRICING[resolved.model] ?? { promptPer1k: 0, completionPer1k: 0 };
    const costUsd = (promptTokens / 1000) * pricing.promptPer1k + (completionTokens / 1000) * pricing.completionPer1k;
    await AiUsageLog.create({
      tenantId, feature: 'jd-kra-generation', aiModel: resolved.model,
      promptTokens, completionTokens, totalTokens: promptTokens + completionTokens,
      costUSD: costUsd, costINR: costUsd * 83, status: 'SUCCESS',
      createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    await Tenant.updateOne({ _id: tenantId }, { $inc: { aiCredits: -1 } });

    return result;
  } catch (err: any) {
    await AiUsageLog.create({
      tenantId, feature: 'jd-kra-generation', status: 'FAILURE',
      metadata: { error: err.message }, createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    if (err instanceof AiFeatureError) throw err;
    if (isQuotaError(err.message)) {
      throw new AiFeatureError(`${describeQuotaError(err.message)} Please try again later, or fill the job description and KRA in manually for now.`, 429);
    }
    throw new AiFeatureError('AI JD/KRA generation failed', 502);
  }
};

interface CandidateProfileExtraction {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
  address: string;
  country: string;
  state: string;
  city: string;
  postalCode: string;
  candidateType: 'Experienced' | 'Fresher';
  totalExperience: string;
  currentOrMostRecentDesignation: string;
  education: Array<{ qualification: string; university: string; institute: string; monthYear: string; result: string }>;
  technicalSkills: string[];
  employmentHistory: Array<{ employer: string; periodFrom: string; periodTo: string; designation: string; ctc: string }>;
}

const CANDIDATE_PROFILE_JSON_SCHEMA: JsonSchemaDef = {
  name: 'candidate_profile_extraction',
  schema: {
    type: 'object',
    properties: {
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      email: { type: 'string' },
      phone: { type: 'string' },
      gender: { type: 'string', description: 'Male/Female/Other, only if explicitly stated or unambiguous from name — else empty string' },
      dateOfBirth: { type: 'string', description: 'YYYY-MM-DD if stated, else empty string' },
      address: { type: 'string' },
      country: { type: 'string' },
      state: { type: 'string' },
      city: { type: 'string' },
      postalCode: { type: 'string' },
      candidateType: { type: 'string', enum: ['Experienced', 'Fresher'], description: 'Fresher if no employment history is listed, else Experienced' },
      totalExperience: { type: 'string', description: 'Total years of experience (e.g. 5, 2.5), else empty string if fresher' },
      currentOrMostRecentDesignation: { type: 'string', description: 'Their current or most recent job title, for suggesting a role applied for' },
      education: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            qualification: { type: 'string' }, university: { type: 'string' }, institute: { type: 'string' }, monthYear: { type: 'string', description: 'YYYY-MM if known' }, result: { type: 'string' },
          },
          required: ['qualification', 'university', 'institute', 'monthYear', 'result'],
          additionalProperties: false,
        },
      },
      technicalSkills: { type: 'array', items: { type: 'string' }, description: 'Individual technical/IT skill or tool names mentioned' },
      employmentHistory: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            employer: { type: 'string' }, periodFrom: { type: 'string', description: 'YYYY-MM' }, periodTo: { type: 'string', description: 'YYYY-MM, empty if current job' }, designation: { type: 'string' }, ctc: { type: 'string' },
          },
          required: ['employer', 'periodFrom', 'periodTo', 'designation', 'ctc'],
          additionalProperties: false,
        },
      },
    },
    required: ['firstName', 'lastName', 'email', 'phone', 'gender', 'dateOfBirth', 'address', 'country', 'state', 'city', 'postalCode', 'candidateType', 'totalExperience', 'currentOrMostRecentDesignation', 'education', 'technicalSkills', 'employmentHistory'],
    additionalProperties: false,
  },
};
export const extractCandidateProfile = async (
  tenantId: string,
  resumeUrl: string,
  triggeredBy: string,
): Promise<CandidateProfileExtraction> => {
  const providers = await resolveAllTenantAiProviders(tenantId);
  console.log(`[AI Extraction] Available active providers for tenant ${tenantId}:`, providers.map(p => ({ provider: p.provider, model: p.model, keyLen: p.apiKey?.length })));
  if (!providers.length) throw new AiFeatureError(NOT_CONFIGURED_MESSAGE, 400);

  let resumeText: string;
  try {
    resumeText = await extractResumeText(resumeUrl);
  } catch (err: any) {
    // mammoth (the .docx reader) throws this exact message for a legacy .doc file — it only
    // understands the newer, zip-based .docx format, so a plain "could not read" error leaves
    // no clue that the fix is "re-save as .docx or PDF and re-upload."
    const isLegacyDocError = /end of central directory|is this a zip file/i.test(err?.message || '');
    throw new AiFeatureError(
      isLegacyDocError
        ? 'This is an older .doc Word file, which isn\'t supported — please re-save it as .docx or PDF and upload again.'
        : 'Could not read the resume file',
      422,
    );
  }
  if (!resumeText) throw new AiFeatureError('Resume contained no extractable text', 422);

  const providerErrors: Array<{ provider: string; error: string }> = [];

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    console.log(`[AI Extraction] Attempting provider ${i + 1}/${providers.length}: ${provider.provider} (${provider.model})`);
    try {
      const { raw, promptTokens, completionTokens } = await callAiJson({
        provider: provider.provider,
        apiKey: provider.apiKey,
        model: provider.model,
        systemPrompt:
          'You extract structured candidate profile information from a resume, to auto-fill a job application ' +
          'form. Only use information explicitly present in the resume text; leave a field as an empty string ' +
          '(or empty array) if it is not stated — never invent or guess personal details.',
        userPrompt: `Resume text:\n${resumeText.slice(0, MAX_RESUME_CHARS)}`,
        jsonSchema: CANDIDATE_PROFILE_JSON_SCHEMA,
      });
      const result = JSON.parse(raw) as CandidateProfileExtraction;

      const pricing = MODEL_PRICING[provider.model] ?? { promptPer1k: 0, completionPer1k: 0 };
      const costUsd = (promptTokens / 1000) * pricing.promptPer1k + (completionTokens / 1000) * pricing.completionPer1k;
      await AiUsageLog.create({
        tenantId, feature: 'candidate-profile-extraction', aiModel: provider.model,
        promptTokens, completionTokens, totalTokens: promptTokens + completionTokens,
        costUSD: costUsd, costINR: costUsd * 83, status: 'SUCCESS',
        createdBy: triggeredBy, updatedBy: triggeredBy,
      } as any);
      await Tenant.updateOne({ _id: tenantId }, { $inc: { aiCredits: -1 } });

      return result;
    } catch (err: any) {
      console.warn(`[AI Provider ${provider.provider} (${provider.model}) failed]:`, err.message);
      providerErrors.push({ provider: provider.provider, error: err.message });
      await AiUsageLog.create({
        tenantId, feature: 'candidate-profile-extraction', status: 'FAILURE',
        aiModel: provider.model,
        metadata: { error: err.message, provider: provider.provider },
        createdBy: triggeredBy, updatedBy: triggeredBy,
      } as any);

      // If there are other configured providers to try, continue
      if (i < providers.length - 1) {
        continue;
      }
    }
  }

  const lastErr = providerErrors[providerErrors.length - 1]?.error || 'unknown error';
  const errorSummary = providerErrors.map(e => `[${e.provider}: ${e.error}]`).join(' | ');

  if (isQuotaError(lastErr)) {
    throw new AiFeatureError(`${describeQuotaError(lastErr)} (Providers tried: ${errorSummary})`, 429);
  }
  throw new AiFeatureError(`AI resume extraction failed across all providers: ${errorSummary}`, 502);
};

interface InterviewQuestionItem {
  question: string;
  category?: string;
  insight?: string;
  difficulty?: string;
}

interface InterviewQuestionsResult {
  questions: (string | InterviewQuestionItem)[];
}

const INTERVIEW_QUESTIONS_JSON_SCHEMA: JsonSchemaDef = {
  name: 'interview_questions',
  schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'Technical domain or category (e.g. Architecture, Database Design, Security, Optimization)' },
            question: { type: 'string', description: 'The question text tailored to the candidate job role, JD, and calibrated to their experience difficulty' },
            insight: { type: 'string', description: 'What this question evaluates and key technical criteria in a strong response' },
            difficulty: { type: 'string', description: 'Difficulty tier: Junior, Mid, Senior, or Lead' }
          },
          required: ['question']
        },
        description: '5-8 interview questions calibrated to the candidate experience, JD and difficulty'
      }
    },
    required: ['questions'],
    additionalProperties: false,
  },
};

/** What each round should actually probe for — shapes question depth/focus, not just topic. */
const ROUND_GUIDANCE: Record<string, string> = {
  'AI Screening Interview': 'First-pass screening: confirm background accuracy, communication clarity, motivation, notice period, and a few high-level skill-check questions.',
  'Technical Interview': 'Deep technical assessment: probe hands-on depth in the listed technical skills, problem-solving, and real scenarios from the responsibilities.',
  'Managerial Interview': 'Ownership and leadership: decision-making, prioritization, stakeholder handling, and how they would approach the key responsibilities.',
  'Written Assessment': 'Structured, scenario-based questions answerable in writing, assessing applied knowledge and judgment rather than conversation.',
  'Offer (HR Round)': 'Closing round: career goals, compensation expectations, culture fit, and any open concerns before an offer.',
};

export function generateCalibratedFallbackQuestions(
  roundType: string,
  jobRole: string = '',
  expYears: number = 0,
  skills: string[] = [],
  jdSummary: string = ''
): Array<{ question: string; category: string; insight: string; difficulty: string }> {
  const role = (jobRole || 'Software Engineer').trim();
  const lower = role.toLowerCase();
  const roundLower = (roundType || '').toLowerCase();
  const topSkills = (skills || []).filter(Boolean).slice(0, 3).join(', ');
  const skillNote = topSkills ? ` (specifically involving ${topSkills})` : '';

  let diffLabel = 'Mid-Level (3-5 Yrs)';
  let level = 'Mid';
  if (expYears < 2) {
    level = 'Junior';
    diffLabel = 'Junior / Entry (0-2 Yrs)';
  } else if (expYears >= 6 && expYears < 10) {
    level = 'Senior';
    diffLabel = 'Senior Level (6-9 Yrs)';
  } else if (expYears >= 10) {
    level = 'Lead';
    diffLabel = 'Lead / Principal (10+ Yrs)';
  }

  // A. Managerial Round
  if (roundLower.includes('managerial') || roundLower.includes('leadership')) {
    if (level === 'Junior' || level === 'Mid') {
      return [
        {
          category: 'Task Prioritization & Deadlines',
          difficulty: diffLabel,
          question: `How do you prioritize deliverables when unexpected high-urgency tasks conflict with planned sprint deadlines as a ${role}?`,
          insight: 'Evaluates time management, structured triage, and composure under delivery pressure.'
        },
        {
          category: 'Conflict Resolution & Peer Collaboration',
          difficulty: diffLabel,
          question: `Describe a disagreement you had with a teammate or cross-functional stakeholder over a technical or project decision. How did you resolve it?`,
          insight: 'Assesses interpersonal maturity, active listening, and finding constructive consensus.'
        },
        {
          category: 'Delivery Ownership & Accountability',
          difficulty: diffLabel,
          question: `Walk through a situation where a project deliverable was at risk of delay. What proactive steps did you take to mitigate the risk?`,
          insight: 'Checks proactive ownership, risk escalation, and solution-oriented accountability.'
        },
        {
          category: 'Feedback & Continuous Growth',
          difficulty: diffLabel,
          question: `How do you receive critical feedback from your manager, and how do you incorporate it into your daily execution?`,
          insight: 'Evaluates receptiveness to feedback, self-awareness, and continuous improvement.'
        },
        {
          category: 'Cross-Functional Communication',
          difficulty: diffLabel,
          question: `How do you explain technical concepts, blockers, or project milestones to non-technical stakeholders (e.g. Sales, Operations)?`,
          insight: 'Tests communication clarity, stakeholder empathy, and translating technical complexity into business impact.'
        }
      ];
    }
    // Senior & Lead Managerial
    return [
      {
        category: 'Strategic Vision & Execution',
        difficulty: diffLabel,
        question: `As a seasoned ${role} (${expYears} years exp), how do you align quarterly engineering OKRs with broader business and revenue targets${skillNote}?`,
        insight: 'Assesses strategic thinking, business acumen, and converting corporate goals into team execution.'
      },
      {
        category: 'Performance Management & Underperformance',
        difficulty: diffLabel,
        question: `Describe how you handled a team member who was consistently missing delivery commitments. What framework did you use to coach or correct the situation?`,
        insight: 'Evaluates performance coaching, empathetic management, objective documentation, and decisive action.'
      },
      {
        category: 'Engineering Culture & Talent Retention',
        difficulty: diffLabel,
        question: `How do you build and maintain a high-performance culture while preventing burnout across high-intensity release cycles?`,
        insight: 'Checks leadership emotional intelligence, sustainable pacing, and talent retention strategies.'
      },
      {
        category: 'Resource Allocation & Headcount Planning',
        difficulty: diffLabel,
        question: `How do you negotiate and justify headcount, tooling budgets, and technical debt repayment against urgent product feature demands?`,
        insight: 'Tests executive negotiation, trade-off analysis, and strategic resource governance.'
      },
      {
        category: 'Crisis Management & Stakeholder Alignment',
        difficulty: diffLabel,
        question: `Describe the highest-stakes outage, project failure, or stakeholder conflict you navigated. How did you manage leadership communications and post-mortem resolution?`,
        insight: 'Evaluates executive presence under pressure, root cause accountability, and systemic problem resolution.'
      }
    ];
  }

  // B. Frontend Roles
  if (lower.includes('frontend') || lower.includes('react') || lower.includes('ui developer') || lower.includes('web developer')) {
    if (level === 'Junior') {
      return [
        {
          category: 'Core Fundamentals & Syntax',
          difficulty: diffLabel,
          question: `As a junior ${role}, explain how the Virtual DOM in React updates the real DOM, and describe the differences between props and state${skillNote}.`,
          insight: 'Evaluates foundational React mechanics, unidirectional data flow, and component lifecycle basics.'
        },
        {
          category: 'Form Handling & State',
          difficulty: diffLabel,
          question: `How do you build controlled form inputs in React, validate user input on the fly, and prevent common re-rendering issues?`,
          insight: 'Checks practical hands-on capability to build standard interactive UI forms cleanly.'
        },
        {
          category: 'Responsive Styling & Layout',
          difficulty: diffLabel,
          question: `Describe how you use Flexbox, CSS Grid, and media queries (e.g. Tailwind or modern CSS) to build a mobile-first responsive layout.`,
          insight: 'Assesses basic layout principles, fluid design, and clean cross-device rendering.'
        },
        {
          category: 'Data Fetching & Error Handling',
          difficulty: diffLabel,
          question: `How do you fetch data from a REST API using fetch/Axios inside useEffect, and how do you display loading and error states to the user?`,
          insight: 'Checks basic asynchronous JavaScript, promise resolution, and user experience awareness.'
        },
        {
          category: 'Code Quality & Debugging',
          difficulty: diffLabel,
          question: `Walk through your process of debugging a JavaScript console error or broken UI component in Chrome DevTools.`,
          insight: 'Tests troubleshooting mindset, breakpoint debugging, and practical problem resolution.'
        }
      ];
    }
    if (level === 'Mid') {
      return [
        {
          category: 'State Architecture & Reusability',
          difficulty: diffLabel,
          question: `As a ${role} with ${expYears} years of experience, how do you decide when to use local state, Context API, or dedicated state stores (Zustand/Redux Toolkit)${skillNote}?`,
          insight: 'Evaluates scalable component hierarchy design, avoiding prop drilling, and state co-location principles.'
        },
        {
          category: 'Performance Profiling & Optimization',
          difficulty: diffLabel,
          question: `What techniques and profiling tools do you use to diagnose unnecessary re-renders, optimize heavy lists (virtualization), and optimize bundle sizes?`,
          insight: 'Assesses useMemo/useCallback discipline, React Profiler, lazy loading, and code-splitting.'
        },
        {
          category: 'Server State & Cache Management',
          difficulty: diffLabel,
          question: `How do you implement optimistic UI updates, background re-validation, and request deduplication using TanStack Query or RTK Query?`,
          insight: 'Checks modern data synchronization patterns, client-side caching, and resilient network error recovery.'
        },
        {
          category: 'Component Library & Accessibility',
          difficulty: diffLabel,
          question: `How do you design accessible compound components adhering to WCAG 2.1 AA keyboard navigation and screen-reader standards?`,
          insight: 'Evaluates design system contributions, a11y compliance, semantic HTML, and multi-device usability.'
        },
        {
          category: 'Automated Testing & Security',
          difficulty: diffLabel,
          question: `What security practices do you enforce to prevent XSS and CSRF attacks on the client side, and how do you approach automated testing with Jest and Playwright/Cypress?`,
          insight: 'Tests code quality assurance, defensive coding against web vulnerabilities, and automated test coverage.'
        }
      ];
    }
    // Senior & Lead Frontend
    return [
      {
        category: 'Micro-Frontends & Architecture',
        difficulty: diffLabel,
        question: `As a senior ${role}, how would you architect a large-scale frontend monorepo (Turborepo/Nx) with shared UI packages and independent squad deployment${skillNote}?`,
        insight: 'Evaluates modular architecture, Module Federation, dependency management, and build cache optimization.'
      },
      {
        category: 'Core Web Vitals & SSR Paradigms',
        difficulty: diffLabel,
        question: `Deeply analyze your strategy for optimizing Core Web Vitals (LCP, INP, CLS) in Next.js/SSR applications, including streaming SSR and selective hydration.`,
        insight: 'Assesses modern server-side rendering mechanics, critical CSS inlining, font optimization, and JavaScript execution budget.'
      },
      {
        category: 'Design Systems at Scale',
        difficulty: diffLabel,
        question: `How do you architect a multi-brand, tokenized design system consumed by 5+ engineering teams, ensuring backward compatibility during major version upgrades?`,
        insight: 'Checks design token architecture (Figma Tokens/Style Dictionary), semantic versioning, and developer experience governance.'
      },
      {
        category: 'Real-Time Sync & Offline Fault Tolerance',
        difficulty: diffLabel,
        question: `How do you design bi-directional WebSocket state sync with client-side indexedDB storage, handling network dropouts, reconnection storms, and conflict resolution?`,
        insight: 'Tests distributed client architecture, CRDT/operational transform basics, and high-reliability offline capabilities.'
      },
      {
        category: 'Frontend Security & Governance',
        difficulty: diffLabel,
        question: `What CSP (Content Security Policy) headers, token rotation mechanisms, and automated dependency supply-chain security gates (SBOM) do you enforce in CI/CD?`,
        insight: 'Evaluates defense-in-depth security governance, third-party script isolation, and engineering standards enforcement.'
      }
    ];
  }

  // C. Backend Roles
  if (lower.includes('backend') || lower.includes('node') || lower.includes('java') || lower.includes('python') || lower.includes('api') || lower.includes('database')) {
    if (level === 'Junior') {
      return [
        {
          category: 'API Fundamentals & HTTP Protocol',
          difficulty: diffLabel,
          question: `As a junior ${role}, explain RESTful API design principles, standard HTTP status codes, and request payload validation${skillNote}.`,
          insight: 'Checks basic protocol understanding, REST conventions, and server-side request validation.'
        },
        {
          category: 'Database Basics & CRUD',
          difficulty: diffLabel,
          question: `Describe the difference between SQL and NoSQL databases, and write or explain a SQL query using JOIN, WHERE, and GROUP BY.`,
          insight: 'Evaluates basic data retrieval, relational modeling fundamentals, and schema querying.'
        },
        {
          category: 'Asynchronous Programming',
          difficulty: diffLabel,
          question: `Explain how the Node.js event loop handles non-blocking I/O operations and how Promises and async/await help prevent callback hell.`,
          insight: 'Tests fundamental language runtime understanding, asynchronous control flow, and error handling.'
        },
        {
          category: 'Authentication Basics',
          difficulty: diffLabel,
          question: `How does JWT authentication work between a client and a backend server, and why should passwords be hashed using algorithms like bcrypt?`,
          insight: 'Assesses basic security hygiene, token lifecycle understanding, and password storage best practices.'
        },
        {
          category: 'Error Handling & Logging',
          difficulty: diffLabel,
          question: `How do you design centralized error-handling middleware in an API framework so clients receive clear, safe error responses without leaking stack traces?`,
          insight: 'Checks practical software craftsmanship and clean error response design.'
        }
      ];
    }
    if (level === 'Mid') {
      return [
        {
          category: 'Database Optimization & Indexing',
          difficulty: diffLabel,
          question: `As a ${role} with ${expYears} years of experience, describe your indexing strategy for high-frequency queries and how you use EXPLAIN plans to eliminate full table scans${skillNote}.`,
          insight: 'Evaluates query execution plan analysis, composite B-Tree indexes, and database performance tuning.'
        },
        {
          category: 'Asynchronous Queues & Background Jobs',
          difficulty: diffLabel,
          question: `How do you implement background job queues using Redis (e.g. BullMQ or Celery) to handle heavy tasks without blocking user-facing API threads?`,
          insight: 'Assesses asynchronous background processing, job retries, dead-letter queues, and concurrency control.'
        },
        {
          category: 'Transactions & Concurrency',
          difficulty: diffLabel,
          question: `How do you handle database transactions (ACID), rollbacks, and optimistic vs pessimistic locking to prevent race conditions during concurrent updates?`,
          insight: 'Checks data integrity, isolation levels, race-condition mitigation, and deadlock avoidance.'
        },
        {
          category: 'API Security & Authorization',
          difficulty: diffLabel,
          question: `How do you implement Role-Based Access Control (RBAC), rate-limiting middleware, and protection against SQL injection and mass-assignment vulnerabilities?`,
          insight: 'Evaluates API defense mechanisms, authorization enforcement, and OWASP Top 10 mitigation.'
        },
        {
          category: 'Testing & Containerization',
          difficulty: diffLabel,
          question: `Describe how you write automated integration tests with mock database containers and how you optimize production Docker container images for minimal footprint.`,
          insight: 'Tests automated test coverage, test isolation, and modern container deployment readiness.'
        }
      ];
    }
    // Senior & Lead Backend
    return [
      {
        category: 'Distributed System Design',
        difficulty: diffLabel,
        question: `As a senior ${role}, architect a high-throughput, fault-tolerant backend capable of handling 50,000 requests/sec with sub-50ms p99 latency${skillNote}.`,
        insight: 'Evaluates microservices partitioning, load balancing, stateless API design, connection pooling, and horizontal scaling.'
      },
      {
        category: 'Event-Driven Architecture & Kafka',
        difficulty: diffLabel,
        question: `How do you design an event-driven system with Kafka/EventBridge, ensuring idempotency, exactly-once processing semantics, and managing dead-letter queues?`,
        insight: 'Assesses streaming event processing, consumer group scaling, partition keys, and out-of-order message handling.'
      },
      {
        category: 'Multi-Tier Caching & Invalidation',
        difficulty: diffLabel,
        question: `Describe your multi-tier caching architecture (in-memory + Redis cluster + CDN), and how you prevent cache stampede, penetration, and avalanche?`,
        insight: 'Tests advanced distributed caching, mutex locks, probabilistic early expiration, and cache invalidation strategies.'
      },
      {
        category: 'Database Sharding & Partitioning',
        difficulty: diffLabel,
        question: `How do you implement database read/write replicas with replication lag handling, and what partitioning/sharding keys do you choose for multi-terabyte datasets?`,
        insight: 'Checks database scalability at volume, replication consistency trade-offs, and horizontal partitioning.'
      },
      {
        category: 'Observability & Zero-Downtime Migration',
        difficulty: diffLabel,
        question: `How do you execute zero-downtime database schema migrations on a 24/7 live database while maintaining OpenTelemetry distributed tracing across all downstream services?`,
        insight: 'Evaluates expand-and-contract migration patterns, distributed tracing, and production resilience under continuous release cycles.'
      }
    ];
  }

  // D. Full Stack Roles
  if (lower.includes('full stack') || lower.includes('fullstack') || lower.includes('mern') || lower.includes('mean')) {
    if (level === 'Junior') {
      return [
        {
          category: 'Full-Stack Data Flow',
          difficulty: diffLabel,
          question: `As a junior Full Stack Developer, explain the end-to-end data lifecycle from a React client form submit, through Express/Node.js, to MongoDB/PostgreSQL storage${skillNote}.`,
          insight: 'Evaluates complete request-response comprehension across the frontend, API, and database layers.'
        },
        {
          category: 'State vs Database Synchronization',
          difficulty: diffLabel,
          question: `How do you ensure UI state in the frontend remains consistent when an API request fails on the backend?`,
          insight: 'Checks optimistic UI handling, error propagation, and state rollbacks.'
        },
        {
          category: 'Authentication & Session Handling',
          difficulty: diffLabel,
          question: `Explain how you store and send auth tokens securely (e.g., httpOnly cookies vs local storage) between frontend and backend.`,
          insight: 'Assesses basic security practices and cross-layer authentication mechanics.'
        },
        {
          category: 'CRUD Implementation & Validation',
          difficulty: diffLabel,
          question: `How do you implement schema validation (e.g. Zod or Joi) on both frontend and backend to avoid duplicate logic and inconsistent data?`,
          insight: 'Checks shared TypeScript types, schema validation, and defensive programming.'
        },
        {
          category: 'Deployment & Environment Variables',
          difficulty: diffLabel,
          question: `How do you manage development vs production environment variables (.env) across frontend and backend services?`,
          insight: 'Tests configuration hygiene, build-time vs runtime variables, and basic deployment awareness.'
        }
      ];
    }
    // Mid & Senior Full Stack
    return [
      {
        category: 'End-to-End Type Safety',
        difficulty: diffLabel,
        question: `As a Full Stack Developer with ${expYears} years exp, how do you architect end-to-end type safety between database schemas, API routes, and frontend state (e.g., tRPC or OpenAPI codegen)${skillNote}?`,
        insight: 'Evaluates typed contracts, eliminating manual schema duplication, and preventing contract breakage.'
      },
      {
        category: 'Performance Profiling & Bottlenecks',
        difficulty: diffLabel,
        question: `When a customer complains that a page takes 6 seconds to load, how do you isolate whether the bottleneck is database query latency, server compute, or client-side rendering?`,
        insight: 'Assesses full-stack diagnostic methodology, waterfall analysis, DB query profiling, and browser DevTools.'
      },
      {
        category: 'Authentication, RBAC & Multi-Tenancy',
        difficulty: diffLabel,
        question: `How do you architect multi-tenant data isolation and role-based access control (RBAC) securely spanning database queries, API middleware, and frontend route guards?`,
        insight: 'Checks tenant leakage prevention, middleware security, and defensive layered authorization.'
      },
      {
        category: 'SSR, Caching & Data Hydration',
        difficulty: diffLabel,
        question: `In modern full-stack frameworks (Next.js App Router / Remix), how do you structure Server Components vs Client Components to minimize bundle size while maximizing interactivity?`,
        insight: 'Evaluates modern hybrid rendering paradigms, data hydration, and streaming performance.'
      },
      {
        category: 'CI/CD & Production Zero-Downtime Releases',
        difficulty: diffLabel,
        question: `How do you architect a CI/CD pipeline that handles automated testing, database migrations, and blue-green container deployments without dropping user sessions?`,
        insight: 'Tests DevOps literacy, deployment risk mitigation, automated regression testing, and rollback strategies.'
      }
    ];
  }

  // E. HR & Talent Acquisition
  if (lower.includes('hr') || lower.includes('human resources') || lower.includes('talent acquisition') || lower.includes('recruiter') || lower.includes('people')) {
    if (level === 'Junior') {
      return [
        {
          category: 'Sourcing & Candidate Screening',
          difficulty: diffLabel,
          question: `As a junior HR/Recruiter, how do you screen inbound resumes against a technical JD and identify red flags or transferable skills${skillNote}?`,
          insight: 'Evaluates resume evaluation skills, job requirement mapping, and initial candidate qualification.'
        },
        {
          category: 'Candidate Experience & Coordination',
          difficulty: diffLabel,
          question: `How do you maintain clear communication and timely updates to candidates throughout multi-stage interview rounds?`,
          insight: 'Assesses organizational skills, candidate empathy, and employer brand representation.'
        },
        {
          category: 'Interview Scheduling & ATS Hygiene',
          difficulty: diffLabel,
          question: `Walk through your daily workflow in an ATS (Applicant Tracking System) for tracking candidates and managing panel interviewer schedules.`,
          insight: 'Checks process adherence, data hygiene, and coordination diligence.'
        },
        {
          category: 'Employee Onboarding Basics',
          difficulty: diffLabel,
          question: `What are the critical steps in executing a smooth day-one onboarding experience for new hires?`,
          insight: 'Evaluates compliance awareness, documentation checklists, and welcoming orientation practices.'
        },
        {
          category: 'HR Queries & Policy Communication',
          difficulty: diffLabel,
          question: `How do you handle routine employee queries regarding leave policies, benefits, and company handbook guidelines?`,
          insight: 'Tests policy knowledge, confidentiality, and professional employee communication.'
        }
      ];
    }
    // Mid & Senior HR
    return [
      {
        category: 'Talent Acquisition Strategy & Metrics',
        difficulty: diffLabel,
        question: `As an HR professional with ${expYears} years exp, how do you optimize Time-to-Hire, Cost-per-Hire, and Quality-of-Hire for hard-to-fill technical and leadership positions${skillNote}?`,
        insight: 'Evaluates recruitment analytics, talent pipeline forecasting, and executive search strategies.'
      },
      {
        category: 'Employee Relations & Conflict Resolution',
        difficulty: diffLabel,
        question: `Describe how you investigated and resolved a complex employee grievance or workplace misconduct complaint while ensuring fair labor compliance and confidentiality.`,
        insight: 'Assesses investigation methodology, labor law adherence, emotional intelligence, and neutrality.'
      },
      {
        category: 'Performance Management & Appraisal Systems',
        difficulty: diffLabel,
        question: `How do you design and facilitate 360-degree performance appraisal cycles that motivate high performers while addressing underperformance constructively?`,
        insight: 'Checks performance appraisal architecture, KPI calibration, and leadership coaching.'
      },
      {
        category: 'Compensation, Benefits & Retention',
        difficulty: diffLabel,
        question: `How do you conduct market salary benchmarking to build competitive compensation bands (ESOPs, bonuses, base) while maintaining budget constraints?`,
        insight: 'Evaluates total rewards design, salary band benchmarking, and retention modeling.'
      },
      {
        category: 'Organizational Culture & Change Management',
        difficulty: diffLabel,
        question: `How do you manage employee morale and retain top talent during periods of organizational restructuring, mergers, or rapid scaling?`,
        insight: 'Tests change management frameworks, executive leadership partnership, and cultural stewardship.'
      }
    ];
  }

  // F. General Fallback Calibrated Questions
  return [
    {
      category: 'Core Domain Execution',
      difficulty: diffLabel,
      question: `As a ${diffLabel} ${role}, what frameworks and standard workflows do you apply daily to deliver consistent, high-quality outcomes${skillNote}?`,
      insight: `Assesses fundamental domain competency and role execution capability.`
    },
    {
      category: 'Problem-Solving & Troubleshooting',
      difficulty: diffLabel,
      question: `Describe a challenging roadblock or unexpected constraint you faced as a ${role}. What structured methodology did you use to diagnose and resolve it?`,
      insight: `Evaluates systematic troubleshooting, analytical depth, and resilience under pressure.`
    },
    {
      category: 'Quality Assurance & Process Adherence',
      difficulty: diffLabel,
      question: `What quality standards and verification checklists do you enforce to ensure your deliverables are compliant with company standards and error-free?`,
      insight: `Checks attention to detail, precision, error prevention, and quality assurance.`
    },
    {
      category: 'Stakeholder Alignment & Collaboration',
      difficulty: diffLabel,
      question: `How do you coordinate with cross-functional teams and align conflicting priorities to ensure project milestones are delivered on schedule?`,
      insight: `Tests stakeholder negotiation, communication clarity, and collaborative teamwork.`
    },
    {
      category: 'Continuous Innovation & Impact',
      difficulty: diffLabel,
      question: `What emerging industry practices, automation tools, or methodologies in ${role} have you adopted to increase efficiency and business value?`,
      insight: `Evaluates forward-looking perspective, continuous learning, and driving measurable impact.`
    }
  ];
}

export const generateInterviewQuestions = async (
  tenantId: string,
  interviewId: string,
  triggeredBy: string,
): Promise<InterviewQuestionsResult> => {
  const interview = await Interview.findOne({ _id: interviewId, tenantId } as any).populate('candidateId');
  if (!interview) throw new AiFeatureError('Interview not found', 404);
  const candidate = interview.candidateId as any;
  const manpowerContext = await buildManpowerContext(tenantId, String(candidate?._id || ''), candidate);

  const roundType = interview.roundType || 'Technical Interview';
  const appDetails = candidate?.applicationDetails || {};
  const totalExpRaw = String(appDetails.totalExperience || candidate?.experience || '').trim();
  const expYears = parseFloat(totalExpRaw.replace(/[^0-9.]/g, '')) || 0;
  const candidateSkills = Array.isArray(appDetails.skills) ? appDetails.skills : (appDetails.skills ? [appDetails.skills] : []);
  const jobRole = candidate?.jobRole || appDetails.appliedFor || 'Software Engineer';
  const jdSummary = candidate?.jobDescriptionSummary || '';

  let difficultyTier = 'Mid-Level (3-5 Years) - Moderate Difficulty';
  let difficultyGuideline = 'Calibrate questions to intermediate depth: practical feature implementation, debugging production issues, API design, code refactoring, and independent delivery.';

  if (expYears < 2) {
    difficultyTier = 'Junior / Entry Level (0-2 Years) - Foundational Difficulty';
    difficultyGuideline = 'Calibrate questions to foundational depth: core programming fundamentals, syntax, standard workflows, understanding underlying mechanics, and practical basic problem solving.';
  } else if (expYears >= 6 && expYears < 10) {
    difficultyTier = 'Senior Professional (6-9 Years) - High Difficulty';
    difficultyGuideline = 'Calibrate questions to advanced depth: high-throughput system architecture, database optimization, scalability trade-offs, fault tolerance, security threat modeling, and code quality governance.';
  } else if (expYears >= 10) {
    difficultyTier = 'Lead / Principal / Architect (10+ Years) - Expert Difficulty';
    difficultyGuideline = 'Calibrate questions to expert strategic depth: enterprise-wide systems design, multi-region distributed systems, architectural patterns, technical vision, cloud cost optimization, and engineering leadership.';
  }

  // Check if AI is configured
  const resolved = await resolveTenantAiProvider(tenantId).catch(() => null);

  if (resolved) {
    try {
      const skillsStr = candidateSkills.join(', ') || 'None listed';
      const pastCompanies = Array.isArray(appDetails.experiences)
        ? appDetails.experiences.map((e: any) => `${e.role || ''} at ${e.company || ''}`).filter(Boolean).join('; ')
        : (appDetails.currentCompany || 'None listed');

      const userPrompt = [
        `CANDIDATE INFORMATION:`,
        `Name: ${candidate?.firstName || ''} ${candidate?.lastName || ''}`.trim(),
        `Target Job Role: ${jobRole}`,
        `Total Experience: ${totalExpRaw || `${expYears} years`} (${difficultyTier})`,
        `Candidate Known Skills: ${skillsStr}`,
        `Past Employment Background: ${pastCompanies}`,
        `Interview Round: ${roundType}`,
        `Round Focus: ${ROUND_GUIDANCE[roundType] || 'In-depth assessment of technical skills, problem-solving, and role readiness.'}`,
        '',
        `JOB DESCRIPTION & REQUISITION REQUIREMENTS (JD):`,
        manpowerContext || 'No attached Manpower Request; base questions directly on the Job Role title and candidate experience.',
        '',
        `CRITICAL INSTRUCTIONS FOR DIFFICULTY & RELEVANCE:`,
        `1. ROLE & JD TAILORING: Every question must directly assess technical competencies required by the Job Role and the Job Description (JD).`,
        `2. EXPERIENCE-BASED DIFFICULTY: The difficulty must strictly match: ${difficultyTier}.`,
        `   Guideline: ${difficultyGuideline}`,
        `   Do NOT ask elementary questions to senior candidates, and do NOT ask 10+ year enterprise architecture questions to junior candidates.`,
        `3. REALISTIC PROBLEM-SOLVING: Formulate realistic scenario-based questions that test practical decision-making and troubleshooting rather than mere textbook definitions.`,
        `4. WRITE QUESTIONS FOR THIS ROUND ONLY: Tailor questions for ${roundType}.`,
      ].join('\n');

      const { raw, promptTokens, completionTokens } = await callAiJson({
        provider: resolved.provider,
        apiKey: resolved.apiKey,
        model: resolved.model,
        systemPrompt: 'You are an experienced interview panelist and hiring director preparing technical questions for an interview. Be concrete and rigorously calibrate question difficulty to the candidate years of experience and the JD.',
        userPrompt,
        jsonSchema: INTERVIEW_QUESTIONS_JSON_SCHEMA,
      });
      const result = JSON.parse(raw) as InterviewQuestionsResult;

      const rawQuestions = result.questions || [];
      if (rawQuestions.length > 0) {
        interview.interviewQuestions = rawQuestions.map((item: any) => {
          if (typeof item === 'string') {
            return {
              question: item,
              category: 'Technical Assessment',
              difficulty: difficultyTier,
              answerAnalysis: {
                verdict: 'no_answer',
                reasoning: `Evaluates domain proficiency and practical problem-solving for ${jobRole}.`
              }
            };
          }
          return {
            question: item.question,
            category: item.category || 'Technical Assessment',
            difficulty: item.difficulty || difficultyTier,
            answerAnalysis: {
              verdict: 'no_answer',
              reasoning: item.insight || `Evaluates candidate technical depth and experience at ${difficultyTier}.`
            }
          };
        });
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
      }
    } catch (err: any) {
      await AiUsageLog.create({
        tenantId, feature: 'interview-question-generation', status: 'FAILURE',
        metadata: { error: err.message }, createdBy: triggeredBy, updatedBy: triggeredBy,
      } as any);
      console.warn("AI Question generation failed, applying calibrated role questions fallback:", err.message);
    }
  }

  // Fallback: Generate role-specific, difficulty-calibrated questions
  const fallbackQuestions = generateCalibratedFallbackQuestions(
    roundType,
    jobRole,
    expYears,
    candidateSkills,
    jdSummary
  );

  interview.interviewQuestions = fallbackQuestions.map((q) => ({
    question: q.question,
    category: q.category,
    difficulty: q.difficulty,
    answerAnalysis: {
      verdict: 'no_answer',
      reasoning: q.insight
    }
  }));
  await interview.save();

  return { questions: fallbackQuestions };
};

interface InterviewAnswerResult {
  answer: string;
}

const INTERVIEW_ANSWER_JSON_SCHEMA: JsonSchemaDef = {
  name: 'interview_answer',
  schema: {
    type: 'object',
    properties: {
      answer: { type: 'string', description: 'A benchmark answer (3-6 sentences) an interviewer can compare a candidate response against' },
    },
    required: ['answer'],
    additionalProperties: false,
  },
};
export const generateInterviewAnswer = async (
  tenantId: string,
  interviewId: string,
  questionIndex: number,
  triggeredBy: string,
): Promise<InterviewAnswerResult> => {
  const resolved = await resolveTenantAiProvider(tenantId);
  if (!resolved) throw new AiFeatureError(NOT_CONFIGURED_MESSAGE, 400);

  const interview = await Interview.findOne({ _id: interviewId, tenantId } as any).populate('candidateId', 'firstName lastName jobRole');
  if (!interview) throw new AiFeatureError('Interview not found', 404);
  const questionEntry = interview.interviewQuestions?.[questionIndex];
  if (!questionEntry) throw new AiFeatureError('Question not found on this interview', 404);

  const candidate = interview.candidateId as any;
  const manpowerContext = await buildManpowerContext(tenantId, String(candidate?._id || ''));

  try {
    const roundType = interview.roundType;
    const userPrompt = [
      `Role: ${candidate?.jobRole || 'Unknown role'}`,
      `Interview round: ${roundType}`,
      `Round focus: ${ROUND_GUIDANCE[roundType] || 'General fit and skills assessment.'}`,
      manpowerContext || 'No additional job description/skills context is available.',
      `\nInterview question: "${questionEntry.question}"`,
      '\nWrite a benchmark answer the interviewer can use to judge the candidate\'s actual response — describe what a strong answer covers, with a concrete example where useful.',
    ].join('\n');

    const { raw, promptTokens, completionTokens } = await callAiJson({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.model,
      systemPrompt: 'You are helping an interviewer prepare. For the given interview question, write a benchmark answer the interviewer can compare the candidate\'s real answer against — not a script for the candidate.',
      userPrompt,
      jsonSchema: INTERVIEW_ANSWER_JSON_SCHEMA,
    });
    const result = JSON.parse(raw) as InterviewAnswerResult;

    questionEntry.suggestedAnswer = result.answer;
    await interview.save();

    const pricing = MODEL_PRICING[resolved.model] ?? { promptPer1k: 0, completionPer1k: 0 };
    const costUsd = (promptTokens / 1000) * pricing.promptPer1k + (completionTokens / 1000) * pricing.completionPer1k;
    await AiUsageLog.create({
      tenantId, feature: 'interview-answer-generation', aiModel: resolved.model,
      promptTokens, completionTokens, totalTokens: promptTokens + completionTokens,
      costUSD: costUsd, costINR: costUsd * 83, status: 'SUCCESS',
      createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    await Tenant.updateOne({ _id: tenantId }, { $inc: { aiCredits: -1 } });

    return result;
  } catch (err: any) {
    await AiUsageLog.create({
      tenantId, feature: 'interview-answer-generation', status: 'FAILURE',
      metadata: { error: err.message }, createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    throw err instanceof AiFeatureError ? err : new AiFeatureError('AI interview answer generation failed', 502);
  }
};

export const startInterviewSession = async (
  tenantId: string,
  interviewId: string,
): Promise<{ status: string }> => {
  const interview = await Interview.findOne({ _id: interviewId, tenantId } as any);
  if (!interview) throw new AiFeatureError('Interview not found', 404);
  if (interview.status !== 'Scheduled') throw new AiFeatureError('This interview is not in a startable state', 400);

  interview.status = 'In_Progress';
  interview.recordingSessionStartedAt = new Date();
  await interview.save();

  return { status: interview.status };
};

interface AnswerAnalysisAiResult {
  transcript: string;
  verdict: 'strong' | 'adequate' | 'weak' | 'no_answer';
  reasoning: string;
  followUpSuggestion?: string;
  isSafe: boolean;
  unsafeCategories?: string[];
}

const ANSWER_ANALYSIS_JSON_SCHEMA: JsonSchemaDef = {
  name: 'answer_analysis',
  schema: {
    type: 'object',
    properties: {
      transcript: { type: 'string', description: 'Verbatim transcript of what the candidate said in this clip' },
      verdict: { type: 'string', enum: ['strong', 'adequate', 'weak', 'no_answer'] },
      reasoning: { type: 'string', description: '2-4 sentence explanation of the verdict, referencing what was/was not covered' },
      followUpSuggestion: { type: 'string', description: 'An optional on-screen-only follow-up question the interviewer could ask now, if the answer left a gap worth probing. Omit if not needed.' },
      isSafe: { type: 'boolean', description: 'false if the clip shows nudity/sexual content, graphic violence, or hate symbols' },
      unsafeCategories: { type: 'array', items: { type: 'string', enum: ['nudity', 'sexual', 'violence', 'hate', 'none'] } },
    },
    required: ['transcript', 'verdict', 'reasoning', 'isSafe'],
    additionalProperties: false,
  },
};

export const analyzeAnswerRecording = async (
  tenantId: string,
  interviewId: string,
  questionIndex: number,
  recording: { recordingUrl: string; recordingPublicId?: string | undefined; mimeType: string },
  triggeredBy: string,
): Promise<{ question: IInterviewQuestion }> => {
  const resolved = await resolveTenantAiProvider(tenantId);
  if (!resolved) throw new AiFeatureError(NOT_CONFIGURED_MESSAGE, 400);
  if (resolved.provider !== 'Gemini') {
    throw new AiFeatureError('The active AI provider for this account does not support video/audio analysis yet.', 400);
  }

  const interview = await Interview.findOne({ _id: interviewId, tenantId } as any).populate('candidateId', 'jobRole');
  if (!interview) throw new AiFeatureError('Interview not found', 404);
  const questionEntry = interview.interviewQuestions?.[questionIndex];
  if (!questionEntry) throw new AiFeatureError('Question not found on this interview', 404);

  try {
    const candidate = interview.candidateId as any;
    const mediaBuffer = await fetchFileBuffer(recording.recordingUrl);

    const { raw, promptTokens, completionTokens } = await callGeminiMultimodal({
      apiKey: resolved.apiKey,
      model: resolved.model,
      systemPrompt:
        'You are assisting a live interviewer. Watch/listen to this single answer clip and (1) transcribe what the ' +
        'candidate said, (2) judge how well it answers the given question for the given role, (3) optionally suggest ' +
        'ONE on-screen follow-up question the interviewer could ask right now if there is a clear gap, and (4) flag if ' +
        'the clip itself shows nudity/sexual content, graphic violence, or hate symbols. Be concise and fair.',
      userPrompt: `Role: ${candidate?.jobRole || 'Unknown role'}\nInterview question asked: "${questionEntry.question}"`,
      mediaBuffer,
      mimeType: recording.mimeType,
      jsonSchema: ANSWER_ANALYSIS_JSON_SCHEMA,
      safetySettings: PERMISSIVE_SAFETY_SETTINGS,
    });
    const result = JSON.parse(raw) as AnswerAnalysisAiResult;

    if (!result.isSafe) {
      const categoryLabel = (result.unsafeCategories || []).filter((c) => c !== 'none').join(', ');
      throw new AiFeatureError(
        `This recording was flagged and could not be saved${categoryLabel ? `: ${categoryLabel}` : ''}.`,
        422,
        'UNSAFE_CONTENT',
      );
    }

    questionEntry.recordingUrl = recording.recordingUrl;
    if (recording.recordingPublicId) questionEntry.recordingPublicId = recording.recordingPublicId;
    questionEntry.transcript = result.transcript;
    questionEntry.answerAnalysis = {
      verdict: result.verdict,
      reasoning: result.reasoning,
      followUpSuggestion: result.followUpSuggestion,
    } as IAnswerAnalysis;
    questionEntry.answeredAt = new Date();
    await interview.save();

    const pricing = MODEL_PRICING[resolved.model] ?? { promptPer1k: 0, completionPer1k: 0 };
    const costUsd = (promptTokens / 1000) * pricing.promptPer1k + (completionTokens / 1000) * pricing.completionPer1k;
    await AiUsageLog.create({
      tenantId, feature: 'interview-answer-analysis', aiModel: resolved.model,
      promptTokens, completionTokens, totalTokens: promptTokens + completionTokens,
      costUSD: costUsd, costINR: costUsd * 83, status: 'SUCCESS',
      metadata: { interviewId, questionIndex }, createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    await Tenant.updateOne({ _id: tenantId }, { $inc: { aiCredits: -1 } });

    return { question: questionEntry };
  } catch (err: any) {
    await AiUsageLog.create({
      tenantId, feature: 'interview-answer-analysis', status: 'FAILURE',
      metadata: { interviewId, questionIndex, error: err.message }, createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    throw err instanceof AiFeatureError ? err : new AiFeatureError('AI answer analysis failed', 502);
  }
};

interface TextAnswerAnalysisAiResult {
  verdict: 'strong' | 'adequate' | 'weak' | 'no_answer';
  reasoning: string;
}

const TEXT_ANSWER_ANALYSIS_JSON_SCHEMA: JsonSchemaDef = {
  name: 'text_answer_analysis',
  schema: {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['strong', 'adequate', 'weak', 'no_answer'] },
      reasoning: { type: 'string', description: '2-4 sentence explanation of the verdict, referencing what was/was not covered' },
    },
    required: ['verdict', 'reasoning'],
    additionalProperties: false,
  },
};

export const evaluateInterviewTextAnswers = async (
  tenantId: string,
  interviewId: string,
  triggeredBy: string,
): Promise<{ questions: IInterviewQuestion[] }> => {
  const resolved = await resolveTenantAiProvider(tenantId);
  if (!resolved) throw new AiFeatureError(NOT_CONFIGURED_MESSAGE, 400);

  const interview = await Interview.findOne({ _id: interviewId, tenantId } as any).populate('candidateId', 'firstName lastName jobRole');
  if (!interview) throw new AiFeatureError('Interview not found', 404);
  const candidate = interview.candidateId as any;

  if (!interview.interviewQuestions || interview.interviewQuestions.length === 0) return { questions: [] };

  for (let i = 0; i < interview.interviewQuestions.length; i++) {
    const q = interview.interviewQuestions[i];
    if (q.transcript && (!q.answerAnalysis || q.answerAnalysis.verdict === 'no_answer')) {
      try {
        const userPrompt = `Role: ${candidate?.jobRole || 'Unknown role'}\nInterview question: "${q.question}"\nCandidate's written answer: "${q.transcript}"\nEvaluate the answer.`;
        const { raw, promptTokens, completionTokens } = await callAiJson({
          provider: resolved.provider,
          apiKey: resolved.apiKey,
          model: resolved.model,
          systemPrompt: 'You are assisting a live interviewer. Read the candidate\'s typed answer and judge how well it answers the given question for the given role. Be concise and fair.',
          userPrompt,
          jsonSchema: TEXT_ANSWER_ANALYSIS_JSON_SCHEMA,
        });
        const result = JSON.parse(raw) as TextAnswerAnalysisAiResult;
        q.answerAnalysis = {
          verdict: result.verdict,
          reasoning: result.reasoning,
        } as IAnswerAnalysis;
        q.answeredAt = new Date();

        const pricing = MODEL_PRICING[resolved.model] ?? { promptPer1k: 0, completionPer1k: 0 };
        const costUsd = (promptTokens / 1000) * pricing.promptPer1k + (completionTokens / 1000) * pricing.completionPer1k;
        await AiUsageLog.create({
          tenantId, feature: 'interview-answer-analysis', aiModel: resolved.model,
          promptTokens, completionTokens, totalTokens: promptTokens + completionTokens,
          costUSD: costUsd, costINR: costUsd * 83, status: 'SUCCESS',
          metadata: { interviewId, questionIndex: i }, createdBy: triggeredBy, updatedBy: triggeredBy,
        } as any);
      } catch (err: any) {
        console.error("Error evaluating text answer:", err);
      }
    }
  }

  await interview.save();
  return { questions: interview.interviewQuestions };
};

interface OverallAnalysisAiResult {
  summary: string;
  strengths: string[];
  concerns: string[];
  recommendation: 'strong_hire' | 'hire' | 'lean_no' | 'no_hire';
}

const OVERALL_ANALYSIS_JSON_SCHEMA: JsonSchemaDef = {
  name: 'overall_interview_analysis',
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'A holistic narrative summary of the whole interview for the hiring file' },
      strengths: { type: 'array', items: { type: 'string' } },
      concerns: { type: 'array', items: { type: 'string' } },
      recommendation: { type: 'string', enum: ['strong_hire', 'hire', 'lean_no', 'no_hire'] },
    },
    required: ['summary', 'strengths', 'concerns', 'recommendation'],
    additionalProperties: false,
  },
};

export const generateOverallInterviewAnalysis = async (
  tenantId: string,
  interviewId: string,
  triggeredBy: string,
): Promise<{ overallAnalysis: NonNullable<IInterview['overallAnalysis']> }> => {
  const resolved = await resolveTenantAiProvider(tenantId);
  if (!resolved) throw new AiFeatureError(NOT_CONFIGURED_MESSAGE, 400);

  const interview = await Interview.findOne({ _id: interviewId, tenantId } as any).populate('candidateId', 'firstName lastName jobRole');
  if (!interview) throw new AiFeatureError('Interview not found', 404);
  const candidate = interview.candidateId as any;

  const answeredQuestions = (interview.interviewQuestions || []).filter((q) => q.transcript);
  if (answeredQuestions.length === 0) throw new AiFeatureError('No answers were recorded or noted for this interview yet', 400);

  const perQuestionBlock = answeredQuestions.map((q, i) =>
    `Q${i + 1}: ${q.question}\nTranscript: ${q.transcript}\nVerdict: ${q.answerAnalysis?.verdict || 'n/a'} — ${q.answerAnalysis?.reasoning || ''}`
  ).join('\n\n');

  try {
    const userPrompt = [
      `Candidate: ${candidate?.firstName || ''} ${candidate?.lastName || ''}`.trim(),
      `Role: ${candidate?.jobRole || 'Unknown role'}`,
      `Interview round: ${interview.roundType}`,
      `\nPer-question transcripts and per-answer verdicts:\n${perQuestionBlock}`,
      '\nProduce a holistic summary and hiring recommendation for this round based ONLY on the above.',
    ].join('\n');

    const { raw, promptTokens, completionTokens } = await callAiJson({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.model,
      systemPrompt: 'You are an experienced interview panelist writing the closing summary for one interview round, based on per-question transcripts and per-answer assessments already collected. You produce an advisory recommendation only — the final hire/no-hire decision remains human.',
      userPrompt,
      jsonSchema: OVERALL_ANALYSIS_JSON_SCHEMA,
    });
    const result = JSON.parse(raw) as OverallAnalysisAiResult;

    interview.overallAnalysis = { ...result, generatedAt: new Date() };
    interview.status = 'Completed';
    interview.recordingSessionEndedAt = new Date();
    await interview.save();

    const pricing = MODEL_PRICING[resolved.model] ?? { promptPer1k: 0, completionPer1k: 0 };
    const costUsd = (promptTokens / 1000) * pricing.promptPer1k + (completionTokens / 1000) * pricing.completionPer1k;
    await AiUsageLog.create({
      tenantId, feature: 'interview-summary-analysis', aiModel: resolved.model,
      promptTokens, completionTokens, totalTokens: promptTokens + completionTokens,
      costUSD: costUsd, costINR: costUsd * 83, status: 'SUCCESS',
      metadata: { interviewId }, createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    await Tenant.updateOne({ _id: tenantId }, { $inc: { aiCredits: -1 } });

    return { overallAnalysis: interview.overallAnalysis };
  } catch (err: any) {
    await AiUsageLog.create({
      tenantId, feature: 'interview-summary-analysis', status: 'FAILURE',
      metadata: { interviewId, error: err.message }, createdBy: triggeredBy, updatedBy: triggeredBy,
    } as any);
    throw err instanceof AiFeatureError ? err : new AiFeatureError('AI interview summary generation failed', 502);
  }
};
