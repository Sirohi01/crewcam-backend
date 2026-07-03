import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDB, disconnectTestDB, clearTestDB, createSuperAdmin, createRestrictedUser, authHeader } from '../testUtils/setup';
import { Coupon } from '../../models/Coupon';

test('super-admin coupon endpoints', async (t) => {
  await connectTestDB();

  t.after(async () => {
    await disconnectTestDB();
  });

  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('rejects requests with no auth token', async () => {
    const res = await request(app).get('/api/v1/super-admin/coupons');
    assert.equal(res.status, 401);
  });

  await t.test('rejects a non-super-admin role', async () => {
    const { token } = await createRestrictedUser([]);
    const res = await request(app)
      .get('/api/v1/super-admin/coupons')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 403);
  });

  await t.test('lists all coupons', async () => {
    const { token } = await createSuperAdmin();
    await new Coupon({ code: 'WELCOME10', type: 'PERCENTAGE', value: 10 }).save();

    const res = await request(app)
      .get('/api/v1/super-admin/coupons')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].code, 'WELCOME10');
  });

  await t.test('creates a coupon, uppercasing the code', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/coupons')
      .set('Authorization', authHeader(token))
      .send({ code: 'save20', type: 'PERCENTAGE', value: 20 });

    assert.equal(res.status, 201);
    assert.equal(res.body.code, 'SAVE20');
  });

  await t.test('rejects creating a percentage coupon over 100%', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/coupons')
      .set('Authorization', authHeader(token))
      .send({ code: 'TOOMUCH', type: 'PERCENTAGE', value: 150 });
    assert.equal(res.status, 400);
  });

  await t.test('rejects creating a coupon with a duplicate code', async () => {
    const { token } = await createSuperAdmin();
    await new Coupon({ code: 'DUPE', type: 'FIXED', value: 100 }).save();

    const res = await request(app)
      .post('/api/v1/super-admin/coupons')
      .set('Authorization', authHeader(token))
      .send({ code: 'dupe', type: 'FIXED', value: 50 });
    assert.equal(res.status, 400);
  });

  await t.test('rejects creating a coupon with a non-positive value', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/coupons')
      .set('Authorization', authHeader(token))
      .send({ code: 'ZERO', type: 'FIXED', value: 0 });
    assert.equal(res.status, 400);
  });

  await t.test('updates a coupon', async () => {
    const { token } = await createSuperAdmin();
    const coupon = await new Coupon({ code: 'UPDATEME', type: 'FIXED', value: 100 }).save();

    const res = await request(app)
      .put(`/api/v1/super-admin/coupons/${coupon._id}`)
      .set('Authorization', authHeader(token))
      .send({ value: 200, isActive: false });

    assert.equal(res.status, 200);
    assert.equal(res.body.value, 200);
    assert.equal(res.body.isActive, false);
  });

  await t.test('returns 404 when updating a non-existent coupon', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .put('/api/v1/super-admin/coupons/507f1f77bcf86cd799439099')
      .set('Authorization', authHeader(token))
      .send({ value: 50 });
    assert.equal(res.status, 404);
  });

  await t.test('deletes a coupon', async () => {
    const { token } = await createSuperAdmin();
    const coupon = await new Coupon({ code: 'DELETEME', type: 'FIXED', value: 100 }).save();

    const res = await request(app)
      .delete(`/api/v1/super-admin/coupons/${coupon._id}`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    const remaining = await Coupon.findById(coupon._id);
    assert.equal(remaining, null);
  });

  await t.test('returns 404 when deleting a non-existent coupon', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .delete('/api/v1/super-admin/coupons/507f1f77bcf86cd799439099')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 404);
  });
});
