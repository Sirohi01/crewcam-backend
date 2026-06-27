import { AiUsageLog } from '../models/AiUsageLog';
import { resolveTenantAiProvider, MODEL_PRICING } from './aiService';
import { callAiJson, callAiJsonWithImage, JsonSchemaDef } from './aiProviders';
import { extractTextFromBuffer } from '../utils/documentText';
import { isQuotaError, describeQuotaError } from '../utils/aiErrorClassifier';

const logCost = async (tenantId: string, feature: string, model: string, promptTokens: number, completionTokens: number) => {
  const pricing = MODEL_PRICING[model] ?? { promptPer1k: 0, completionPer1k: 0 };
  const costUsd = (promptTokens / 1000) * pricing.promptPer1k + (completionTokens / 1000) * pricing.completionPer1k;
  await AiUsageLog.create({
    tenantId, feature, aiModel: model,
    promptTokens, completionTokens, totalTokens: promptTokens + completionTokens,
    costUSD: costUsd, costINR: costUsd * 83, status: 'SUCCESS',
  } as any);
};

const logFailure = async (tenantId: string, feature: string, error: string) => {
  await AiUsageLog.create({ tenantId, feature, status: 'FAILURE', metadata: { error } } as any);
};
const isSafetyBlockError = (message: string): boolean =>
  message.includes('AI_SAFETY_BLOCK:') || message.includes('AI returned an empty response');

export interface ImageModerationResult {
  checked: boolean;
  safe: boolean;
  categories: string[];
  reason?: string;
  warning?: string;
}

const MODERATION_JSON_SCHEMA: JsonSchemaDef = {
  name: 'image_moderation',
  schema: {
    type: 'object',
    properties: {
      safe: { type: 'boolean', description: 'false if the image contains nudity/sexual content, graphic violence, hate symbols, or political figures/symbols/propaganda' },
      categories: { type: 'array', items: { type: 'string', enum: ['nudity', 'sexual', 'violence', 'political', 'hate', 'self_harm', 'none'] } },
      reason: { type: 'string', description: 'One short sentence explaining the verdict' },
    },
    required: ['safe', 'categories', 'reason'],
    additionalProperties: false,
  },
};

export const moderateImage = async (tenantId: string, buffer: Buffer, mimeType: string): Promise<ImageModerationResult> => {
  const resolved = await resolveTenantAiProvider(tenantId);
  if (!resolved) return { checked: false, safe: true, categories: [] };

  try {
    const { raw, promptTokens, completionTokens } = await callAiJsonWithImage({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.model,
      systemPrompt: 'You moderate user-uploaded images for a business application. Flag nudity/sexual content, graphic violence, hate symbols, and political figures/symbols/propaganda. Be decisive.',
      userPrompt: 'Assess this image for safety.',
      imageBuffer: buffer,
      mimeType,
      jsonSchema: MODERATION_JSON_SCHEMA,
    });
    const result = JSON.parse(raw) as { safe: boolean; categories: string[]; reason: string };
    await logCost(tenantId, 'image-moderation', resolved.model, promptTokens, completionTokens);
    return { checked: true, safe: result.safe, categories: result.categories || [], reason: result.reason };
  } catch (err: any) {
    await logFailure(tenantId, 'image-moderation', err.message);
    if (isSafetyBlockError(err.message)) {
      return { checked: true, safe: false, categories: ['unclear'], reason: 'Could not verify this image is safe; blocked as a precaution.' };
    }
    if (isQuotaError(err.message)) {
      return { checked: false, safe: true, categories: [], warning: `${describeQuotaError(err.message)} This upload was not screened for unsafe content — please review it manually.` };
    }
    return { checked: false, safe: true, categories: [], warning: 'The AI safety check failed unexpectedly. This upload was not screened for unsafe content — please review it manually.' };
  }
};

export interface DocumentReviewResult {
  checked: boolean;
  verdict: 'genuine' | 'suspicious' | 'unclear';
  reason: string;
}

const DOCUMENT_REVIEW_JSON_SCHEMA: JsonSchemaDef = {
  name: 'document_review',
  schema: {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['genuine', 'suspicious', 'unclear'] },
      reason: { type: 'string', description: 'One short sentence explaining the verdict' },
    },
    required: ['verdict', 'reason'],
    additionalProperties: false,
  },
};

/** Informational only — never blocks the upload. Fails open (returns null) with no AI configured or no extractable text. */
export const reviewDocument = async (
  tenantId: string,
  buffer: Buffer,
  mimeType: string,
  documentLabel?: string,
): Promise<DocumentReviewResult | null> => {
  const resolved = await resolveTenantAiProvider(tenantId);
  if (!resolved) return null;

  const text = await extractTextFromBuffer(buffer, mimeType);
  if (!text || text.length < 20) return { checked: true, verdict: 'unclear', reason: 'No readable text could be extracted from this file.' };

  try {
    const { raw, promptTokens, completionTokens } = await callAiJson({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.model,
      systemPrompt: 'You review uploaded documents for a business application. Based only on the extracted text, judge whether it reads as a genuine, coherent document or shows signs of being corrupted, blank, irrelevant, or fabricated. This is advisory only.',
      userPrompt: `Document type (as labeled by the uploader): ${documentLabel || 'Document'}\n\nExtracted text:\n${text.slice(0, 8000)}`,
      jsonSchema: DOCUMENT_REVIEW_JSON_SCHEMA,
    });
    const result = JSON.parse(raw) as { verdict: 'genuine' | 'suspicious' | 'unclear'; reason: string };
    await logCost(tenantId, 'document-review', resolved.model, promptTokens, completionTokens);
    return { checked: true, verdict: result.verdict, reason: result.reason };
  } catch (err: any) {
    await logFailure(tenantId, 'document-review', err.message);
    return null;
  }
};
