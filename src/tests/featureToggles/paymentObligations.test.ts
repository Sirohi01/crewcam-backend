import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app, connectTestDB, disconnectTestDB, clearTestDB, authHeader } from '../testUtils/setup';
import { User } from '../../models/User';
import { Role } from '../../models/Role';
import { Tenant } from '../../models/Tenant';
import { Package } from '../../models/Package';
import { Company } from '../../models/Company';
import { PlatformModule } from '../../models/dropdowns/Module';
import { signAccessToken } from '../../utils/authTokens';
import { PAYMENT_OBLIGATIONS_FEATURE } from '../../utils/featureKeys';

// Payment Obligations is an optional add-on. It must be switchable at three levels and
// the API gate and the sidebar must always agree:
//  - per package   (plan builder stores the catalogue module's _id in addOnModules)
//  - per company   (Company.addonModules holds the feature code)
//  - platform-wide (deactivating the catalogue module turns it off everywhere)

const OBLIGATION_LABELS = ['Monthly Obligations', 'Yearly Obligations', 'Tax Obligations', 'Payment Reminders'];

async function createObligationsModule(isActive = true) {
  return new PlatformModule({
    name: 'Payment Obligations',
    code: PAYMENT_OBLIGATIONS_FEATURE,
    category: 'Finance',
    description: 'Recurring payments and statutory dues',
    isActive,
    isDefaultModule: false,
  }).save();
}

async function createTenantAdmin(opts: { addOnModules?: string[]; features?: string[]; allowedSections?: string[] } = {}) {
  const pkg = await new Package({
    name: `Plan ${Math.random()}`,
    maxUsers: 50,
    features: opts.features ?? ['Core HR'],
    addOnModules: opts.addOnModules ?? [],
    isActive: true,
  }).save();
  const tenant = await new Tenant({ name: 'Acme Pvt Ltd', packageId: pkg._id, allowedSections: opts.allowedSections ?? [] }).save();
  const tenantId = String(tenant._id);
  const role = await new Role({ name: 'Company Admin', permissions: ['*'], tenantId, loginType: 'employer' }).save();
  const user = await new User({
    email: `admin-${tenantId}@test.crewcam.app`,
    passwordHash: await bcrypt.hash('Sup3rSecret!', 4),
    firstName: 'Admin',
    lastName: 'User',
    roleId: role._id,
    tenantId,
    isActive: true,
  }).save();
  return { tenantId, token: signAccessToken(user) };
}

const statusOf = (token: string) =>
  request(app).get('/api/v1/payment-obligations/status').set('Authorization', authHeader(token));

const sidebarLabels = async (token: string): Promise<string[]> => {
  const res = await request(app).get('/api/v1/permissions/sidebar-config/mine').set('Authorization', authHeader(token));
  assert.equal(res.status, 200);
  const items: any[] = Array.isArray(res.body) ? res.body : res.body.items || res.body.data || [];
  return items.map((i) => i.label);
};

const hasObligationsSection = (labels: string[]) => OBLIGATION_LABELS.every((l) => labels.includes(l));
const hasNoObligationsItems = (labels: string[]) => OBLIGATION_LABELS.every((l) => !labels.includes(l));

test('Payment Obligations add-on toggle', async (t) => {
  await connectTestDB();
  t.after(async () => {
    await disconnectTestDB();
  });
  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('off by default: API 403 and no sidebar section', async () => {
    await createObligationsModule();
    const { token } = await createTenantAdmin();

    assert.equal((await statusOf(token)).status, 403);
    assert.ok(hasNoObligationsItems(await sidebarLabels(token)));
  });

  await t.test('on via the package (plan builder stores the module id)', async () => {
    const mod = await createObligationsModule();
    const { token } = await createTenantAdmin({ addOnModules: [String(mod._id)] });

    const res = await statusOf(token);
    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, true);
    assert.ok(hasObligationsSection(await sidebarLabels(token)));
  });

  await t.test('on via the company add-ons', async () => {
    await createObligationsModule();
    const { tenantId, token } = await createTenantAdmin();
    await new Company({ tenantId, legalName: 'Acme Pvt Ltd', email: 'hr@acme.test', addonModules: [PAYMENT_OBLIGATIONS_FEATURE] }).save();

    assert.equal((await statusOf(token)).status, 200);
    assert.ok(hasObligationsSection(await sidebarLabels(token)));
  });

  await t.test('deactivating the catalogue module switches it off everywhere', async () => {
    const mod = await createObligationsModule(false);
    const { token } = await createTenantAdmin({ addOnModules: [String(mod._id)] });

    assert.equal((await statusOf(token)).status, 403);
    assert.ok(hasNoObligationsItems(await sidebarLabels(token)));
  });

  await t.test('section survives an allowedSections restriction once the add-on is on', async () => {
    const mod = await createObligationsModule();
    const { token } = await createTenantAdmin({ addOnModules: [String(mod._id)], allowedSections: ['Workspace'] });

    assert.ok(hasObligationsSection(await sidebarLabels(token)));
  });

  await t.test('v2 packages storing core-feature module ids now gate correctly (generic fix)', async () => {
    const integrations = await new PlatformModule({
      name: 'Integrations',
      code: 'integrations',
      category: 'Advanced',
      description: 'Third-party integrations',
      isDefaultModule: true,
    }).save();
    const withIt = await createTenantAdmin({ features: ['Core HR', String(integrations._id)] });
    assert.ok((await sidebarLabels(withIt.token)).includes('Integrations'));

    await clearTestDB();
    const without = await createTenantAdmin({ features: ['Core HR'] });
    assert.ok(!(await sidebarLabels(without.token)).includes('Integrations'));
  });
});
