import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDB, disconnectTestDB, clearTestDB, createSuperAdmin, createRestrictedUser, authHeader } from '../testUtils/setup';
import { PlatformAiProvider } from '../../models/PlatformAiProvider';

test('super-admin AI provider endpoints', async (t) => {
  await connectTestDB();

  t.after(async () => {
    await disconnectTestDB();
  });

  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('rejects requests with no auth token', async () => {
    const res = await request(app).get('/api/v1/super-admin/ai-providers').query({ tenantId: 'tenant-1' });
    assert.equal(res.status, 401);
  });

  await t.test('rejects a non-super-admin role', async () => {
    const { token } = await createRestrictedUser([]);
    const res = await request(app)
      .get('/api/v1/super-admin/ai-providers')
      .query({ tenantId: 'tenant-1' })
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 403);
  });

  await t.test('requires a tenantId query param', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .get('/api/v1/super-admin/ai-providers')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 400);
  });

  await t.test('seeds and returns the default AI providers for a tenant', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .get('/api/v1/super-admin/ai-providers')
      .query({ tenantId: 'tenant-1' })
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 3);
    const providers = res.body.map((p: any) => p.provider).sort();
    assert.deepEqual(providers, ['Anthropic', 'Gemini', 'OpenAI']);
    assert.equal(res.body[0].hasApiKey, false);
    assert.ok(Array.isArray(res.body[0].availableModels));
  });

  await t.test('rejects configuring an unknown provider', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .put('/api/v1/super-admin/ai-providers')
      .set('Authorization', authHeader(token))
      .send({ tenantId: 'tenant-1', provider: 'NotARealProvider' });
    assert.equal(res.status, 400);
  });

  await t.test('requires tenantId when configuring a provider', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .put('/api/v1/super-admin/ai-providers')
      .set('Authorization', authHeader(token))
      .send({ provider: 'OpenAI' });
    assert.equal(res.status, 400);
  });

  await t.test('returns 404 configuring a provider that has not been seeded yet', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .put('/api/v1/super-admin/ai-providers')
      .set('Authorization', authHeader(token))
      .send({ tenantId: 'tenant-1', provider: 'OpenAI', apiKey: 'sk-test' });
    assert.equal(res.status, 404);
  });

  await t.test('configures an AI provider after it has been seeded', async () => {
    const { token } = await createSuperAdmin();
    await request(app)
      .get('/api/v1/super-admin/ai-providers')
      .query({ tenantId: 'tenant-1' })
      .set('Authorization', authHeader(token));

    const res = await request(app)
      .put('/api/v1/super-admin/ai-providers')
      .set('Authorization', authHeader(token))
      .send({ tenantId: 'tenant-1', provider: 'OpenAI', apiKey: 'sk-test-key', model: 'gpt-4o', isActive: true });

    assert.equal(res.status, 200);
    assert.equal(res.body.provider.provider, 'OpenAI');
    assert.equal(res.body.provider.model, 'gpt-4o');
    assert.equal(res.body.provider.isActive, true);
    assert.equal(res.body.provider.hasApiKey, true);

    const stored = await PlatformAiProvider.findOne({ tenantId: 'tenant-1', provider: 'OpenAI' }).setOptions({ bypassTenantIsolation: true });
    assert.equal(stored?.getDecryptedApiKey(), 'sk-test-key');
  });
});
