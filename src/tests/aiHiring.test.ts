import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAiCredits } from '../middleware/aiCreditGate';
import { Tenant } from '../models/Tenant';
import { stripPii } from '../services/aiService';

const fakeTenantQuery = (aiCredits: number | null) => ({
  select: () => ({
    lean: () => Promise.resolve(aiCredits === null ? null : { aiCredits }),
  }),
});

const runMiddleware = async (aiCredits: number | null) => {
  const originalFindById = Tenant.findById;
  (Tenant as any).findById = () => fakeTenantQuery(aiCredits);

  const req: any = { tenantId: 'tenant-1', user: { tenantId: 'tenant-1' } };
  const responseBody: any[] = [];
  const res: any = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this; },
    json(body: any) { responseBody.push(body); return this; },
  };
  let nextCalled = false;

  try {
    await requireAiCredits(req, res, () => { nextCalled = true; });
  } finally {
    (Tenant as any).findById = originalFindById;
  }

  return { nextCalled, statusCode: res.statusCode, body: responseBody[0] };
};

test('requireAiCredits blocks a 0-credit tenant with 403 before any call could happen', async () => {
  const { nextCalled, statusCode } = await runMiddleware(0);
  assert.equal(nextCalled, false);
  assert.equal(statusCode, 403);
});

test('requireAiCredits blocks a tenant with no aiCredits record at all (treated as 0)', async () => {
  const { nextCalled, statusCode } = await runMiddleware(null);
  assert.equal(nextCalled, false);
  assert.equal(statusCode, 403);
});

test('requireAiCredits lets a positive-credit tenant through', async () => {
  const { nextCalled, statusCode } = await runMiddleware(5);
  assert.equal(nextCalled, true);
  assert.equal(statusCode, 200);
});

test('stripPii redacts email, phone, Aadhaar and PAN patterns before they reach the prompt', () => {
  const text = 'Contact: jane.doe@example.com, +91 98765 43210. Aadhaar 234567890123. PAN ABCDE1234F.';
  const redacted = stripPii(text);
  assert.ok(!redacted.includes('jane.doe@example.com'));
  assert.ok(!redacted.includes('98765 43210'));
  assert.ok(!redacted.includes('234567890123'));
  assert.ok(!redacted.includes('ABCDE1234F'));
  assert.ok(redacted.includes('[email]'));
  assert.ok(redacted.includes('[pan]'));
});
