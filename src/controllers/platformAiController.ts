import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { PlatformAiProvider } from '../models/PlatformAiProvider';

const DEFAULTS: Array<{ provider: 'OpenAI' | 'Gemini' | 'Anthropic'; modelName: string }> = [
  { provider: 'OpenAI', modelName: 'gpt-4o-mini' },
  { provider: 'Gemini', modelName: 'gemini-2.5-flash' },
  { provider: 'Anthropic', modelName: 'claude-3-5-haiku-20241022' },
];
export const MODEL_OPTIONS: Record<'OpenAI' | 'Gemini' | 'Anthropic', Array<{ value: string; label: string }>> = {
  OpenAI: [
    { value: 'gpt-4o-mini', label: 'GPT-4o mini — cheap, fast (default)' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini — cheap, newer' },
    { value: 'gpt-4o', label: 'GPT-4o — stronger reasoning' },
    { value: 'gpt-4.1', label: 'GPT-4.1 — strongest, costliest' },
  ],
  Gemini: [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — cheap, fast (default)' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite — cheapest' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — stronger reasoning, costliest' },
  ],
  Anthropic: [
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku — cheap, fast (default)' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — newer, cheap' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — stronger reasoning' },
    { value: 'claude-opus-4-8', label: 'Claude Opus 4.8 — strongest, costliest' },
  ],
};
export const getAllAiProviders = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.query.tenantId as string | undefined;
    if (!tenantId) return res.status(400).json({ message: 'tenantId query param is required' });

    for (const def of DEFAULTS) {
      await PlatformAiProvider.findOneAndUpdate(
        { tenantId, provider: def.provider },
        { $setOnInsert: { tenantId, provider: def.provider, modelName: def.modelName, isActive: false, apiKey: '' } },
        { upsert: true },
      );
    }

    const providers = await PlatformAiProvider.find({ tenantId }).sort({ provider: 1 });
    res.status(200).json(providers.map((p) => ({
      _id: p._id,
      provider: p.provider,
      model: p.modelName,
      isActive: p.isActive,
      hasApiKey: Boolean(p.apiKey),
      apiKey: p.getMaskedApiKey(),
      availableModels: MODEL_OPTIONS[p.provider],
    })));
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching AI providers', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

/** Super-admin only — upserts one tenant's provider key/model/active flag. Empty apiKey leaves the stored key untouched. */
export const configureAiProvider = async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, provider, apiKey, model, isActive } = req.body;
    if (!tenantId) return res.status(400).json({ message: 'tenantId is required' });
    if (!['OpenAI', 'Gemini', 'Anthropic'].includes(provider)) {
      return res.status(400).json({ message: 'Unknown provider' });
    }

    const doc = await PlatformAiProvider.findOne({ tenantId, provider });
    if (!doc) return res.status(404).json({ message: 'Provider not found' });

    if (apiKey) doc.apiKey = apiKey;
    if (model) doc.modelName = model;
    if (isActive !== undefined) doc.isActive = isActive;
    await doc.save();

    res.status(200).json({
      message: 'AI provider updated successfully',
      provider: { _id: doc._id, provider: doc.provider, model: doc.modelName, isActive: doc.isActive, hasApiKey: Boolean(doc.apiKey), apiKey: doc.getMaskedApiKey() },
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error configuring AI provider', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};
