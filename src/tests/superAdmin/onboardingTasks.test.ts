import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDB, disconnectTestDB, clearTestDB, createSuperAdmin, createRestrictedUser, authHeader } from '../testUtils/setup';
import { Package } from '../../models/Package';
import { Tenant } from '../../models/Tenant';
import { OnboardingTask } from '../../models/OnboardingTask';

test('super-admin onboarding task endpoints', async (t) => {
  await connectTestDB();

  t.after(async () => {
    await disconnectTestDB();
  });

  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('rejects requests with no auth token', async () => {
    const res = await request(app).get('/api/v1/super-admin/onboarding-tasks');
    assert.equal(res.status, 401);
  });

  await t.test('rejects a non-super-admin role', async () => {
    const { token } = await createRestrictedUser([]);
    const res = await request(app)
      .get('/api/v1/super-admin/onboarding-tasks')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 403);
  });

  await t.test('rejects creating a task with an unknown tenant', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/onboarding-tasks')
      .set('Authorization', authHeader(token))
      .send({ tenantId: '507f1f77bcf86cd799439099', category: 'IMPLEMENTATION', title: 'Setup branch' });
    assert.equal(res.status, 400);
  });

  await t.test('rejects creating a task with an invalid category', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    const tenant = await new Tenant({ name: 'Acme', packageId: pkg._id }).save();

    const res = await request(app)
      .post('/api/v1/super-admin/onboarding-tasks')
      .set('Authorization', authHeader(token))
      .send({ tenantId: String(tenant._id), category: 'NOT_REAL', title: 'Setup branch' });
    assert.equal(res.status, 400);
  });

  await t.test('creates an onboarding task', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    const tenant = await new Tenant({ name: 'Acme', packageId: pkg._id }).save();

    const res = await request(app)
      .post('/api/v1/super-admin/onboarding-tasks')
      .set('Authorization', authHeader(token))
      .send({ tenantId: String(tenant._id), category: 'IMPLEMENTATION', title: 'Setup branch' });

    assert.equal(res.status, 201);
    assert.equal(res.body.title, 'Setup branch');
    assert.equal(res.body.status, 'PENDING');
  });

  await t.test('lists onboarding tasks with pagination and tenant name populated', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    const tenant = await new Tenant({ name: 'Acme', packageId: pkg._id }).save();
    await new OnboardingTask({ tenantId: tenant._id, category: 'DEPLOYMENT', title: 'Deploy workspace' }).save();

    const res = await request(app)
      .get('/api/v1/super-admin/onboarding-tasks')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].tenantId.name, 'Acme');
    assert.equal(res.body.pagination.total, 1);
  });

  await t.test('filters onboarding tasks by search term', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    const tenant = await new Tenant({ name: 'Acme', packageId: pkg._id }).save();
    await new OnboardingTask({ tenantId: tenant._id, category: 'DEPLOYMENT', title: 'Deploy workspace' }).save();
    await new OnboardingTask({ tenantId: tenant._id, category: 'IMPLEMENTATION', title: 'Configure payroll' }).save();

    const res = await request(app)
      .get('/api/v1/super-admin/onboarding-tasks')
      .query({ search: 'payroll' })
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].title, 'Configure payroll');
  });

  await t.test('updates a task and sets completedAt when marked DONE', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    const tenant = await new Tenant({ name: 'Acme', packageId: pkg._id }).save();
    const task = await new OnboardingTask({ tenantId: tenant._id, category: 'DEPLOYMENT', title: 'Deploy workspace' }).save();

    const res = await request(app)
      .put(`/api/v1/super-admin/onboarding-tasks/${task._id}`)
      .set('Authorization', authHeader(token))
      .send({ status: 'DONE' });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'DONE');
    assert.ok(res.body.completedAt);
  });

  await t.test('returns 404 when updating a non-existent task', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .put('/api/v1/super-admin/onboarding-tasks/507f1f77bcf86cd799439099')
      .set('Authorization', authHeader(token))
      .send({ status: 'DONE' });
    assert.equal(res.status, 404);
  });

  await t.test('deletes a task', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    const tenant = await new Tenant({ name: 'Acme', packageId: pkg._id }).save();
    const task = await new OnboardingTask({ tenantId: tenant._id, category: 'DEPLOYMENT', title: 'Deploy workspace' }).save();

    const res = await request(app)
      .delete(`/api/v1/super-admin/onboarding-tasks/${task._id}`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    const remaining = await OnboardingTask.findById(task._id);
    assert.equal(remaining, null);
  });

  await t.test('returns 404 when deleting a non-existent task', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .delete('/api/v1/super-admin/onboarding-tasks/507f1f77bcf86cd799439099')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 404);
  });
});
