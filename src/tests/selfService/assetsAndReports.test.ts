import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { app, connectTestDB, disconnectTestDB, clearTestDB, authHeader, createSuperAdmin } from '../testUtils/setup';
import { User } from '../../models/User';
import { Role } from '../../models/Role';
import { Tenant } from '../../models/Tenant';
import { Package } from '../../models/Package';
import { Asset } from '../../models/Asset';
import { Notification } from '../../models/Notification';
import { signAccessToken } from '../../utils/authTokens';

// Phase 1D-3a — My Assets, asset allocation (which failed: the asset update had no tenant
// filter, so the tenant guard threw after the allocation was created), and "Report a
// problem" submissions routed to the CrewCam team instead of the company helpdesk.

let TENANT = '';
let seq = 0;
const SHOT = 'http://localhost/uploads/screenshot.jpg';

async function createTenant() {
  const pkg = await new Package({ name: `plan ${++seq}`, maxUsers: 50, features: ['*'], isActive: true }).save();
  return String((await new Tenant({ name: `Epsilon ${seq}`, packageId: pkg._id }).save())._id);
}

async function createUser(label: string, permissions: string[] = ['profile_read', 'attendance_read'], tenantId = TENANT) {
  const role = await new Role({ name: `${label} role ${++seq}`, permissions, tenantId }).save();
  const user = await new User({
    email: `${label}${seq}@test.crewcam.app`, passwordHash: await bcrypt.hash('x', 4), firstName: label, lastName: 'T',
    roleId: role._id, tenantId, isActive: true,
  }).save();
  return { user, token: authHeader(signAccessToken(user)) };
}

const asset = (over: Record<string, unknown> = {}) =>
  Asset.create({ tenantId: TENANT, name: 'Dell Latitude', type: 'Laptop', serialNumber: `SN-${++seq}`, purchaseValue: 75000, ...over } as any);

test('assets and problem reports', async (t) => {
  await connectTestDB();
  t.after(disconnectTestDB);
  t.beforeEach(async () => { TENANT = await createTenant(); });
  t.afterEach(clearTestDB);

  await t.test('allocating and returning an asset updates the asset and notifies the employee', async () => {
    const it = await createUser('it', ['SUPPORT_READ', 'SUPPORT_WRITE']);
    const amy = await createUser('amy');
    const laptop = await asset();

    const res = await request(app).post('/api/v1/support/assets/allocate').set('Authorization', it.token)
      .send({ assetId: String(laptop._id), employeeId: String(amy.user._id), condition: 'Good' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal((await Asset.findOne({ _id: laptop._id, tenantId: TENANT } as any))!.status, 'Allocated');
    assert.equal(await Notification.countDocuments({ tenantId: TENANT, audienceValue: amy.user._id, title: 'Asset assigned to you' } as any), 1);

    // Already allocated → not available again.
    assert.equal((await request(app).post('/api/v1/support/assets/allocate').set('Authorization', it.token)
      .send({ assetId: String(laptop._id), employeeId: String(it.user._id) })).status, 400);

    const back = await request(app).post(`/api/v1/support/assets/return/${res.body._id}`).set('Authorization', it.token).send({ condition: 'Good' });
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.equal((await Asset.findOne({ _id: laptop._id, tenantId: TENANT } as any))!.status, 'Available');
  });

  await t.test('cannot allocate to someone outside the company; asset writes ignore unknown fields', async () => {
    const it = await createUser('it', ['SUPPORT_READ', 'SUPPORT_WRITE']);
    const otherTenant = await createTenant();
    const outsider = await createUser('outsider', undefined, otherTenant);
    const laptop = await asset();
    assert.equal((await request(app).post('/api/v1/support/assets/allocate').set('Authorization', it.token)
      .send({ assetId: String(laptop._id), employeeId: String(outsider.user._id) })).status, 400);

    const created = await request(app).post('/api/v1/support/assets').set('Authorization', it.token)
      .send({ name: 'iPhone', type: 'Mobile', serialNumber: 'IMEI-1', purchaseValue: 52000, tenantId: otherTenant, createdAt: '2000-01-01' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(String(created.body.tenantId), TENANT);
    assert.equal(created.body.purchaseValue, 52000);
  });

  await t.test('my assets: only mine; asset tickets only for assets assigned to me', async () => {
    const it = await createUser('it', ['SUPPORT_READ', 'SUPPORT_WRITE']);
    const amy = await createUser('amy');
    const ben = await createUser('ben');
    const amyLaptop = await asset();
    const benPhone = await asset({ name: 'iPhone', type: 'Mobile' });
    for (const [a, u] of [[amyLaptop, amy], [benPhone, ben]] as const) {
      await request(app).post('/api/v1/support/assets/allocate').set('Authorization', it.token).send({ assetId: String(a._id), employeeId: String(u.user._id) });
    }

    const mine = await request(app).get('/api/v1/me/assets').set('Authorization', amy.token);
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.body.allocations.map((x: any) => x.assetId.name), ['Dell Latitude']);
    assert.equal(mine.body.allocations[0].assetId.purchaseValue, 75000);

    const issue = { department: 'IT', subject: 'Screen flickers', description: 'Since Monday', attachmentUrl: SHOT };
    assert.equal((await request(app).post('/api/v1/me/tickets').set('Authorization', amy.token).send({ ...issue, assetId: String(benPhone._id) })).status, 400);
    assert.equal((await request(app).post('/api/v1/me/tickets').set('Authorization', amy.token).send({ ...issue, attachmentUrl: 'https://evil.example/x.jpg' })).status, 400);
    assert.equal((await request(app).post('/api/v1/me/tickets').set('Authorization', amy.token).send({ ...issue, assetId: String(amyLaptop._id) })).status, 201);
    const after = await request(app).get('/api/v1/me/assets').set('Authorization', amy.token);
    assert.equal(after.body.openIssues.length, 1);
  });

  await t.test('problem reports go to the CrewCam team, not the company queue', async () => {
    const amy = await createUser('amy');
    const hr = await createUser('hr', ['SUPPORT_READ', 'SUPPORT_WRITE']);
    const sa = await createSuperAdmin();

    const sent = await request(app).post('/api/v1/me/platform-reports').set('Authorization', amy.token)
      .send({ issueType: 'bug', description: 'Payslip page is blank\nOn Chrome', pageUrl: '/dashboard/payslip-and-income-tax', screenshotUrl: SHOT });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    assert.equal(sent.body.ticket.channel, 'platform');
    assert.equal(sent.body.ticket.subject, 'Bug report: Payslip page is blank');

    const queue = await request(app).get('/api/v1/support/tickets').set('Authorization', hr.token);
    assert.equal(queue.body.length, 0, 'company helpdesk must not see platform reports');
    assert.equal((await request(app).get('/api/v1/me/tickets').set('Authorization', amy.token)).body.tickets.length, 1);

    const list = await request(app).get('/api/v1/super-admin/tickets?channel=platform').set('Authorization', authHeader(sa.token));
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.platformOpenCount, 1);

    const id = sent.body.ticket._id;
    const upd = await request(app).patch(`/api/v1/super-admin/tickets/${id}`).set('Authorization', authHeader(sa.token)).send({ status: 'Resolved', resolution: 'Fixed in release 2.3' });
    assert.equal(upd.status, 200, JSON.stringify(upd.body));
    assert.equal(await Notification.countDocuments({ tenantId: TENANT, audienceValue: amy.user._id, title: 'Your report was resolved' } as any), 1);

    // A company's own helpdesk ticket is not the CrewCam team's to change.
    const own = await request(app).post('/api/v1/me/tickets').set('Authorization', amy.token).send({ department: 'HR', subject: 'Payslip query', description: 'Deduction' });
    assert.equal((await request(app).patch(`/api/v1/super-admin/tickets/${own.body.ticket._id}`).set('Authorization', authHeader(sa.token)).send({ status: 'Closed' })).status, 404);
    assert.equal((await request(app).post('/api/v1/me/platform-reports').set('Authorization', amy.token).send({ issueType: 'bug', description: 'x', screenshotUrl: 'https://evil.example/x.png' })).status, 400);
  });

  await t.test('HR broadcasts to a department reach that department (target id was stored as a string)', async () => {
    const dept = new mongoose.Types.ObjectId();
    const hr = await createUser('hr', ['ORG_WRITE']);
    const amy = await createUser('amy');
    await User.updateOne({ _id: amy.user._id, tenantId: TENANT } as any, { departmentId: dept });
    const res = await request(app).post('/api/v1/communication/notifications').set('Authorization', hr.token)
      .send({ title: 'Team lunch', message: 'Friday 1pm', audienceType: 'Department', audienceValue: String(dept) });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const feed = await request(app).get('/api/v1/me/notifications').set('Authorization', amy.token);
    assert.deepEqual(feed.body.items.map((n: any) => n.title), ['Team lunch']);
  });
});
