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
import { Notification } from '../../models/Notification';
import { EmployeeProfileDetail } from '../../models/EmployeeProfileDetail';
import { notificationService } from '../../services/notificationService';
import { signAccessToken } from '../../utils/authTokens';

// Phase 1D-3b — the Emergency page's "Trigger Emergency Alert" did nothing and its
// helplines/addresses were sample data. Alerts now reach responders and the reporting
// manager, are acknowledged/resolved, and texts to emergency contacts are recorded
// honestly. The SMS sender is stubbed: the real .env may hold a live provider key.

let TENANT = '';
let seq = 0;
const realSendSMS = notificationService.sendSMS;

async function createTenant() {
  const pkg = await new Package({ name: `plan ${++seq}`, maxUsers: 50, features: ['*'], isActive: true }).save();
  return String((await new Tenant({ name: `Zeta ${seq}`, packageId: pkg._id }).save())._id);
}

async function createUser(label: string, permissions: string[] = ['profile_read', 'attendance_read'], extra: Record<string, unknown> = {}) {
  const role = await new Role({ name: `${label} role ${++seq}`, permissions, tenantId: TENANT }).save();
  const user = await new User({
    email: `${label}${seq}@test.crewcam.app`, passwordHash: await bcrypt.hash('x', 4), firstName: label, lastName: 'T',
    roleId: role._id, tenantId: TENANT, isActive: true, ...extra,
  }).save();
  return { user, token: authHeader(signAccessToken(user)) };
}

const alertsFor = (userId: unknown) => Notification.countDocuments({ tenantId: TENANT, audienceValue: userId, title: /Emergency alert/ } as any);

test('emergency alerts', async (t) => {
  await connectTestDB();
  t.after(async () => { notificationService.sendSMS = realSendSMS; await disconnectTestDB(); });
  t.beforeEach(async () => { TENANT = await createTenant(); });
  t.afterEach(async () => { notificationService.sendSMS = realSendSMS; await clearTestDB(); });

  await t.test('page data: no invented helplines; office address falls back to the company address', async () => {
    await Company.create({ tenantId: TENANT, name: 'Zeta Pvt Ltd', legalName: 'Zeta Private Limited', email: 'hr@zeta.example', addressLine1: '12 MG Road', city: 'Pune', state: 'Maharashtra' } as any);
    const amy = await createUser('amy');
    const res = await request(app).get('/api/v1/me/emergency').set('Authorization', amy.token);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.settings.helplines, []);
    assert.equal(res.body.settings.officeAddress, '12 MG Road, Pune, Maharashtra');
    assert.equal(res.body.settings.configured, false);
    assert.equal(res.body.activeAlert, null);
  });

  await t.test('trigger notifies responders and the manager — not colleagues, not the reporter; repeat press is idempotent', async () => {
    const admin = await createUser('admin', ['*']);
    const hr = await createUser('hr', ['EMERGENCY_RESPOND']);
    const boss = await createUser('boss');
    const colleague = await createUser('colleague');
    const amy = await createUser('amy', undefined, { reportingToId: boss.user._id });

    const res = await request(app).post('/api/v1/me/emergency/alerts').set('Authorization', amy.token)
      .send({ message: 'Feeling faint, 3rd floor', location: { lat: 18.52, lng: 73.85, accuracy: 20 } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.alert.respondersNotified, 3);
    for (const u of [admin, hr, boss]) assert.equal(await alertsFor(u.user._id), 1);
    assert.equal(await alertsFor(colleague.user._id), 0);
    assert.equal(await alertsFor(amy.user._id), 0);

    const again = await request(app).post('/api/v1/me/emergency/alerts').set('Authorization', amy.token).send({});
    assert.equal(again.status, 200);
    assert.equal(again.body.duplicate, true);
    assert.equal(again.body.alert._id, res.body.alert._id);
    assert.equal(await alertsFor(hr.user._id), 1, 'no second page');

    assert.equal((await request(app).post('/api/v1/me/emergency/alerts').set('Authorization', amy.token).send({ location: { lat: 200, lng: 0 } })).status, 400, 'invalid coordinates rejected');
  });

  await t.test('responders acknowledge then resolve; the employee is told; no responding to your own alert', async () => {
    const hr = await createUser('hr', ['EMERGENCY_RESPOND']);
    const amy = await createUser('amy');
    const colleague = await createUser('colleague');
    const { body } = await request(app).post('/api/v1/me/emergency/alerts').set('Authorization', amy.token).send({});
    const id = body.alert._id;

    assert.equal((await request(app).get('/api/v1/emergency/alerts').set('Authorization', colleague.token)).status, 403);
    const list = await request(app).get('/api/v1/emergency/alerts?status=open').set('Authorization', hr.token);
    assert.equal(list.body.openCount, 1);
    assert.equal(list.body.alerts[0].userId.firstName, 'amy');

    assert.equal((await request(app).patch(`/api/v1/emergency/alerts/${id}`).set('Authorization', hr.token).send({ status: 'Acknowledged' })).status, 200);
    assert.equal((await request(app).patch(`/api/v1/emergency/alerts/${id}`).set('Authorization', hr.token).send({ status: 'Acknowledged' })).status, 409);
    assert.equal((await request(app).patch(`/api/v1/emergency/alerts/${id}`).set('Authorization', hr.token).send({ status: 'Resolved', note: 'First aid given' })).status, 200);
    assert.equal(await Notification.countDocuments({ tenantId: TENANT, audienceValue: amy.user._id, title: 'Help is on the way' } as any), 1);
    assert.equal(await Notification.countDocuments({ tenantId: TENANT, audienceValue: amy.user._id, title: 'Your emergency alert was resolved' } as any), 1);

    // A responder raising their own alert can't close it themselves.
    const own = await request(app).post('/api/v1/me/emergency/alerts').set('Authorization', hr.token).send({});
    assert.equal((await request(app).patch(`/api/v1/emergency/alerts/${own.body.alert._id}`).set('Authorization', hr.token).send({ status: 'Resolved' })).status, 403);
  });

  await t.test('employee can cancel their own open alert only', async () => {
    const amy = await createUser('amy');
    const ben = await createUser('ben');
    const { body } = await request(app).post('/api/v1/me/emergency/alerts').set('Authorization', amy.token).send({});
    assert.equal((await request(app).post(`/api/v1/me/emergency/alerts/${body.alert._id}/cancel`).set('Authorization', ben.token)).status, 404);
    const res = await request(app).post(`/api/v1/me/emergency/alerts/${body.alert._id}/cancel`).set('Authorization', amy.token);
    assert.equal(res.body.alert.status, 'Cancelled');
    const page = await request(app).get('/api/v1/me/emergency').set('Authorization', amy.token);
    assert.equal(page.body.activeAlert, null);
  });

  await t.test('texts to emergency contacts only when switched on, and a simulated send is not reported as sent', async () => {
    const hr = await createUser('hr', ['ORG_WRITE', 'EMERGENCY_RESPOND']);
    const amy = await createUser('amy');
    await EmployeeProfileDetail.create({ tenantId: TENANT, userId: amy.user._id, emergencyContacts: [
      { name: 'Mum', relationship: 'Mother', mobile: '9800000001', isPrimary: true },
      { name: 'Raj', relationship: 'Brother', mobile: '9800000002', isPrimary: false },
    ] } as any);
    const sent: string[] = [];
    notificationService.sendSMS = (async (_t: string, to: string) => {
      sent.push(to);
      if (to.endsWith('2')) throw new Error('provider down');
      return { success: true, simulated: true };
    }) as any;

    // Off by default.
    let res = await request(app).post('/api/v1/me/emergency/alerts').set('Authorization', amy.token).send({});
    assert.deepEqual(res.body.alert.contactNotices, []);
    assert.equal(sent.length, 0);
    await request(app).post(`/api/v1/me/emergency/alerts/${res.body.alert._id}/cancel`).set('Authorization', amy.token);

    const saved = await request(app).put('/api/v1/emergency/settings').set('Authorization', hr.token).send({
      smsEmergencyContacts: true,
      helplines: [{ label: 'Security', number: '+91 98765 43210' }],
      safetyTips: ['Use the stairs, not lifts'],
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));

    res = await request(app).post('/api/v1/me/emergency/alerts').set('Authorization', amy.token).send({});
    assert.deepEqual(res.body.alert.contactNotices.map((n: any) => n.result), ['not-configured', 'failed']);

    const page = await request(app).get('/api/v1/me/emergency').set('Authorization', amy.token);
    assert.equal(page.body.settings.helplines[0].number, '+91 98765 43210');
    assert.equal(page.body.settings.configured, true);
  });

  await t.test('safety settings: ORG_WRITE only, validated, outside documents rejected', async () => {
    const amy = await createUser('amy');
    const hr = await createUser('hr', ['ORG_WRITE']);
    assert.equal((await request(app).put('/api/v1/emergency/settings').set('Authorization', amy.token).send({ safetyTips: ['x'] })).status, 403);
    assert.equal((await request(app).put('/api/v1/emergency/settings').set('Authorization', hr.token).send({ helplines: [{ label: 'Fire', number: 'call us' }] })).status, 400);
    assert.equal((await request(app).put('/api/v1/emergency/settings').set('Authorization', hr.token).send({ guideUrl: 'https://evil.example/guide.pdf' })).status, 400);
    assert.equal((await request(app).put('/api/v1/emergency/settings').set('Authorization', hr.token).send({ tenantId: 'x' })).status, 400);
  });
});
