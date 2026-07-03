import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDB, disconnectTestDB, clearTestDB, createSuperAdmin, createRestrictedUser, authHeader } from '../testUtils/setup';
import { Package } from '../../models/Package';
import { User } from '../../models/User';

test('super-admin tenants endpoints', async (t) => {
  await connectTestDB();

  t.after(async () => {
    await disconnectTestDB();
  });

  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('rejects requests with no auth token', async () => {
    const res = await request(app).get('/api/v1/super-admin/tenants');
    assert.equal(res.status, 401);
  });

  await t.test('rejects a non-super-admin role', async () => {
    const { token } = await createRestrictedUser([]);
    const res = await request(app)
      .get('/api/v1/super-admin/tenants')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 403);
  });

  await t.test('lists tenants for a super admin', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .get('/api/v1/super-admin/tenants')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  await t.test('creates a tenant with a company admin', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();

    const res = await request(app)
      .post('/api/v1/super-admin/tenants')
      .set('Authorization', authHeader(token))
      .send({
        name: 'Acme Corp',
        packageId: pkg._id,
        aiCredits: 100,
        adminFirstName: 'Jane',
        adminLastName: 'Doe',
        adminEmail: 'jane.doe@acme.test',
        adminPassword: 'Password1',
        country: 'India',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Acme Corp');

    const list = await request(app)
      .get('/api/v1/super-admin/tenants')
      .set('Authorization', authHeader(token));
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].admin.email, 'jane.doe@acme.test');
  });

  await t.test('rejects tenant creation with a weak admin password', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();

    const res = await request(app)
      .post('/api/v1/super-admin/tenants')
      .set('Authorization', authHeader(token))
      .send({
        name: 'Weak Pw Co',
        packageId: pkg._id,
        adminFirstName: 'Jane',
        adminLastName: 'Doe',
        adminEmail: 'weak@acme.test',
        adminPassword: 'weak',
      });

    assert.equal(res.status, 400);
  });

  await t.test('rejects tenant creation when admin email already exists', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    await request(app)
      .post('/api/v1/super-admin/tenants')
      .set('Authorization', authHeader(token))
      .send({
        name: 'First Co',
        packageId: pkg._id,
        adminFirstName: 'Jane',
        adminLastName: 'Doe',
        adminEmail: 'dupe@acme.test',
        adminPassword: 'Password1',
      });

    const res = await request(app)
      .post('/api/v1/super-admin/tenants')
      .set('Authorization', authHeader(token))
      .send({
        name: 'Second Co',
        packageId: pkg._id,
        adminFirstName: 'John',
        adminLastName: 'Doe',
        adminEmail: 'dupe@acme.test',
        adminPassword: 'Password1',
      });

    assert.equal(res.status, 400);
  });

  await t.test('updates a tenant and deactivates its users', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    const created = await request(app)
      .post('/api/v1/super-admin/tenants')
      .set('Authorization', authHeader(token))
      .send({
        name: 'Update Co',
        packageId: pkg._id,
        adminFirstName: 'Jane',
        adminLastName: 'Doe',
        adminEmail: 'update@acme.test',
        adminPassword: 'Password1',
      });

    const res = await request(app)
      .put(`/api/v1/super-admin/tenants/${created.body._id}`)
      .set('Authorization', authHeader(token))
      .send({ name: 'Updated Co', isActive: false });

    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Updated Co');

    const adminUser = await User.findOne({ email: 'update@acme.test' }).setOptions({ bypassTenantIsolation: true });
    assert.equal(adminUser?.isActive, false);
  });

  await t.test('returns 404 when updating a non-existent tenant', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .put('/api/v1/super-admin/tenants/507f1f77bcf86cd799439099')
      .set('Authorization', authHeader(token))
      .send({ name: 'Nope' });
    assert.equal(res.status, 404);
  });

  await t.test('deletes a tenant and its associated data', async () => {
    const { token } = await createSuperAdmin();
    const pkg = await new Package({ name: 'Basic', maxUsers: 10 }).save();
    const created = await request(app)
      .post('/api/v1/super-admin/tenants')
      .set('Authorization', authHeader(token))
      .send({
        name: 'Delete Co',
        packageId: pkg._id,
        adminFirstName: 'Jane',
        adminLastName: 'Doe',
        adminEmail: 'delete@acme.test',
        adminPassword: 'Password1',
      });

    const res = await request(app)
      .delete(`/api/v1/super-admin/tenants/${created.body._id}`)
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 200);

    const list = await request(app)
      .get('/api/v1/super-admin/tenants')
      .set('Authorization', authHeader(token));
    assert.equal(list.body.length, 0);
  });

  await t.test('returns 404 when deleting a non-existent tenant', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .delete('/api/v1/super-admin/tenants/507f1f77bcf86cd799439099')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 404);
  });
});
