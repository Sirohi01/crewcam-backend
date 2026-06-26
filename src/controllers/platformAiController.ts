import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { PlatformAiProvider } from '../models/PlatformAiProvider';

const DEFAULTS: Array<{ provider: 'OpenAI' | 'Gemini' | 'Anthropic'; modelName: string }> = [
  { provider: 'OpenAI', modelName: 'gpt-4o-mini' },
  { provider: 'Gemini', modelName: 'gemini-2.5-flash' },
  { provider: 'Anthropic', modelName: 'claude-3-5-haiku-20241022' },
];

/** Super-admin only — lists one tenant's provider docs (creating the three defaults on first read). */
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
