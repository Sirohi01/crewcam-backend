import test from 'node:test';
import assert from 'node:assert/strict';
import { Tenant } from '../models/Tenant';
import { PlatformAiProvider } from '../models/PlatformAiProvider';
import { AiUsageLog } from '../models/AiUsageLog';
import { moderateImage, reviewDocument } from '../services/contentModerationService';
import * as aiProviders from '../services/aiProviders';

const stubNoActiveProvider = () => {
  const originalFindById = Tenant.findById;
  const originalFindOne = PlatformAiProvider.findOne;
  (Tenant as any).findById = () => ({ select: () => Promise.resolve(null) });
  (PlatformAiProvider as any).findOne = () => ({ sort: () => Promise.resolve(null) });
  return () => {
    (Tenant as any).findById = originalFindById;
    (PlatformAiProvider as any).findOne = originalFindOne;
  };
};

test('moderateImage fails open (no AI call, upload allowed) when the tenant has no active AI provider', async () => {
  const restore = stubNoActiveProvider();
  try {
    const result = await moderateImage('tenant-1', Buffer.from('fake-image-bytes'), 'image/png');
    assert.equal(result.checked, false);
    assert.equal(result.safe, true);
  } finally {
    restore();
  }
});

test('reviewDocument fails open (returns null, no AI call) when the tenant has no active AI provider', async () => {
  const restore = stubNoActiveProvider();
  try {
    const result = await reviewDocument('tenant-1', Buffer.from('fake-pdf-bytes'), 'application/pdf', 'Resume');
    assert.equal(result, null);
  } finally {
    restore();
  }
});

test('moderateImage fails CLOSED (blocks the upload) when a provider is configured but the moderation call errors — e.g. the provider\'s own safety filter silently refusing on explicit content', async () => {
  const originalFindById = Tenant.findById;
  const originalFindOne = PlatformAiProvider.findOne;
  const originalCallWithImage = aiProviders.callAiJsonWithImage;
  const originalLogCreate = AiUsageLog.create;

  (Tenant as any).findById = () => ({ select: () => Promise.resolve({ preferredAiProvider: undefined }) });
  (PlatformAiProvider as any).findOne = () => ({
    sort: () => Promise.resolve({ provider: 'Gemini', modelName: 'gemini-2.5-flash', getDecryptedApiKey: () => 'fake-key' }),
  });
  (aiProviders as any).callAiJsonWithImage = async () => { throw new Error('AI returned an empty response'); };
  (AiUsageLog as any).create = async () => ({});

  try {
    const result = await moderateImage('tenant-1', Buffer.from('fake-image-bytes'), 'image/png');
    assert.equal(result.checked, true);
    assert.equal(result.safe, false);
  } finally {
    (Tenant as any).findById = originalFindById;
    (PlatformAiProvider as any).findOne = originalFindOne;
    (aiProviders as any).callAiJsonWithImage = originalCallWithImage;
    (AiUsageLog as any).create = originalLogCreate;
  }
});

test('moderateImage fails OPEN but surfaces a manual-review warning when the provider is configured and the call hits a quota/rate-limit error', async () => {
  const originalFindById = Tenant.findById;
  const originalFindOne = PlatformAiProvider.findOne;
  const originalCallWithImage = aiProviders.callAiJsonWithImage;
  const originalLogCreate = AiUsageLog.create;

  (Tenant as any).findById = () => ({ select: () => Promise.resolve({ preferredAiProvider: undefined }) });
  (PlatformAiProvider as any).findOne = () => ({
    sort: () => Promise.resolve({ provider: 'Gemini', modelName: 'gemini-2.5-flash', getDecryptedApiKey: () => 'fake-key' }),
  });
  (aiProviders as any).callAiJsonWithImage = async () => {
    throw new Error('[429 Too Many Requests] quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier');
  };
  (AiUsageLog as any).create = async () => ({});

  try {
    const result = await moderateImage('tenant-1', Buffer.from('fake-image-bytes'), 'image/png');
    assert.equal(result.checked, false);
    assert.equal(result.safe, true);
    assert.ok(result.warning && result.warning.length > 0);
  } finally {
    (Tenant as any).findById = originalFindById;
    (PlatformAiProvider as any).findOne = originalFindOne;
    (aiProviders as any).callAiJsonWithImage = originalCallWithImage;
    (AiUsageLog as any).create = originalLogCreate;
  }
});
