import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDB, disconnectTestDB, clearTestDB, createSuperAdmin, createRestrictedUser, authHeader } from '../testUtils/setup';
import { Banner } from '../../models/Banner';

test('super-admin banner endpoints', async (t) => {
  await connectTestDB();

  t.after(async () => {
    await disconnectTestDB();
  });

  t.afterEach(async () => {
    await clearTestDB();
  });

  await t.test('rejects requests with no auth token', async () => {
    const res = await request(app).get('/api/v1/super-admin/banners');
    assert.equal(res.status, 401);
  });

  await t.test('rejects a non-super-admin role', async () => {
    const { token } = await createRestrictedUser([]);
    const res = await request(app)
      .get('/api/v1/super-admin/banners')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 403);
  });

  await t.test('lists all banners sorted by order', async () => {
    const { token } = await createSuperAdmin();
    await new Banner({ imageUrl: 'https://example.test/b2.png', order: 2 }).save();
    await new Banner({ imageUrl: 'https://example.test/b1.png', order: 1 }).save();

    const res = await request(app)
      .get('/api/v1/super-admin/banners')
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
    assert.equal(res.body[0].imageUrl, 'https://example.test/b1.png');
  });

  await t.test('rejects creating a banner without an image', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/banners')
      .set('Authorization', authHeader(token))
      .send({ title: 'No Image' });
    assert.equal(res.status, 400);
  });

  await t.test('creates a banner', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post('/api/v1/super-admin/banners')
      .set('Authorization', authHeader(token))
      .send({ imageUrl: 'https://example.test/banner.png', title: 'New Feature' });

    assert.equal(res.status, 201);
    assert.equal(res.body.title, 'New Feature');
    assert.equal(res.body.isActive, true);
  });

  await t.test('updates a banner', async () => {
    const { token } = await createSuperAdmin();
    const banner = await new Banner({ imageUrl: 'https://example.test/old.png' }).save();

    const res = await request(app)
      .put(`/api/v1/super-admin/banners/${banner._id}`)
      .set('Authorization', authHeader(token))
      .send({ imageUrl: 'https://example.test/new.png', isActive: false });

    assert.equal(res.status, 200);
    assert.equal(res.body.imageUrl, 'https://example.test/new.png');
    assert.equal(res.body.isActive, false);
  });

  await t.test('returns 404 when updating a non-existent banner', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .put('/api/v1/super-admin/banners/507f1f77bcf86cd799439099')
      .set('Authorization', authHeader(token))
      .send({ title: 'Nope' });
    assert.equal(res.status, 404);
  });

  await t.test('deletes a banner', async () => {
    const { token } = await createSuperAdmin();
    const banner = await new Banner({ imageUrl: 'https://example.test/del.png' }).save();

    const res = await request(app)
      .delete(`/api/v1/super-admin/banners/${banner._id}`)
      .set('Authorization', authHeader(token));

    assert.equal(res.status, 200);
    const remaining = await Banner.findById(banner._id);
    assert.equal(remaining, null);
  });

  await t.test('returns 404 when deleting a non-existent banner', async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .delete('/api/v1/super-admin/banners/507f1f77bcf86cd799439099')
      .set('Authorization', authHeader(token));
    assert.equal(res.status, 404);
  });
});
