import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app, connectTestDB, disconnectTestDB, clearTestDB, authHeader } from '../testUtils/setup';
import { User } from '../../models/User';
import { Role } from '../../models/Role';
import { Tenant } from '../../models/Tenant';
import { Package } from '../../models/Package';
import { Notification } from '../../models/Notification';
import { Ticket } from '../../models/Ticket';
import { signAccessToken } from '../../utils/authTokens';

// Phase 1D-1 — helpdesk, notifications and tasks for employees, plus the leaks found
// while wiring them: any user could mark (and read back) any notification by ID, and
// ticket creation accepted status/assignee from the request body.

let TENANT = '';
let seq = 0;

async function createTenant(name: string) {
  const pkg = await new Package({ name: `${name} plan`, maxUsers: 50, features: ['*'], isActive: true }).save();
  return String((await new Tenant({ name, packageId: pkg._id }).save())._id);
}

/** permissions default to the seeded "Employee" role: no SUPPORT_* or EMPLOYEE_* rights. */
async function createUser(label: string, permissions: string[] = ['profile_read', 'attendance_read'], extra: Record<string, unknown> = {}) {
  const role = await new Role({ name: `${label} role ${++seq}`, permissions, tenantId: TENANT }).save();
  const user = await new User({
    email: `${label}@test.crewcam.app`, passwordHash: await bcrypt.hash('x', 4), firstName: label, lastName: 'T',
    roleId: role._id, tenantId: TENANT, isActive: true, ...extra,
  }).save();
  return { user, token: authHeader(signAccessToken(user)) };
}

test('employee helpdesk, notifications and tasks', async (t) => {
  await connectTestDB();
  t.after(disconnectTestDB);
  t.beforeEach(async () => { TENANT = await createTenant('Gamma Pvt Ltd'); });
  t.afterEach(clearTestDB);

  await t.test('employees raise and list only their own tickets; status/assignee in the body are ignored', async () => {
    const amy = await createUser('amy');
    const ben = await createUser('ben');

    const created = await request(app).post('/api/v1/me/tickets').set('Authorization', amy.token)
      .send({ department: 'IT', subject: 'Laptop broken', description: 'Screen flickers', priority: 'High', status: 'Resolved', assignedTo: String(ben.user._id) });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.match(created.body.ticket.ticketNumber, /^HD-\d{4}-0001$/);
    assert.equal(created.body.ticket.status, 'Open');
    assert.equal(created.body.ticket.assignedTo, undefined);

    await request(app).post('/api/v1/me/tickets').set('Authorization', ben.token)
      .send({ department: 'HR', subject: 'Payslip query', description: 'Deduction looks wrong' });

    const mine = await request(app).get('/api/v1/me/tickets').set('Authorization', amy.token);
    assert.equal(mine.status, 200);
    assert.equal(mine.body.tickets.length, 1);
    assert.equal(mine.body.stats.open, 1);

    const bad = await request(app).post('/api/v1/me/tickets').set('Authorization', amy.token).send({ department: 'Canteen', subject: 'x', description: 'y' });
    assert.equal(bad.status, 400);
  });

  await t.test('only resolved tickets can be rated, once, by their owner', async () => {
    const amy = await createUser('amy');
    const ben = await createUser('ben');
    const { body } = await request(app).post('/api/v1/me/tickets').set('Authorization', amy.token)
      .send({ department: 'IT', subject: 'VPN access', description: 'Need VPN' });
    const id = body.ticket._id;

    assert.equal((await request(app).post(`/api/v1/me/tickets/${id}/rating`).set('Authorization', amy.token).send({ rating: 5 })).status, 404);
    await Ticket.updateOne({ _id: id, tenantId: TENANT } as any, { status: 'Resolved', resolvedAt: new Date() });
    assert.equal((await request(app).post(`/api/v1/me/tickets/${id}/rating`).set('Authorization', ben.token).send({ rating: 1 })).status, 404);
    assert.equal((await request(app).post(`/api/v1/me/tickets/${id}/rating`).set('Authorization', amy.token).send({ rating: 4, feedback: 'Quick' })).status, 200);
    assert.equal((await request(app).post(`/api/v1/me/tickets/${id}/rating`).set('Authorization', amy.token).send({ rating: 1 })).status, 404);
  });

  await t.test('support staff cannot resolve their own ticket; resolving someone else\'s notifies them', async () => {
    const amy = await createUser('amy');
    const hr = await createUser('hr', ['SUPPORT_READ', 'SUPPORT_WRITE']);
    const own = await request(app).post('/api/v1/support/tickets').set('Authorization', hr.token)
      .send({ department: 'IT', subject: 'My monitor', description: 'Dead pixel', status: 'Closed' });
    assert.equal(own.status, 201, JSON.stringify(own.body));
    assert.equal(own.body.status, 'Open');
    assert.equal((await request(app).put(`/api/v1/support/tickets/${own.body._id}`).set('Authorization', hr.token).send({ status: 'Resolved' })).status, 403);

    const { body } = await request(app).post('/api/v1/me/tickets').set('Authorization', amy.token)
      .send({ department: 'Facility', subject: 'AC not cooling', description: 'Floor 2' });
    const res = await request(app).put(`/api/v1/support/tickets/${body.ticket._id}`).set('Authorization', hr.token).send({ status: 'Resolved', resolution: 'Gas refilled' });
    assert.equal(res.status, 200);

    const feed = await request(app).get('/api/v1/me/notifications').set('Authorization', amy.token);
    assert.equal(feed.body.items.length, 1);
    assert.match(feed.body.items[0].message, /AC not cooling/);
    assert.equal(feed.body.items[0].isDirect, true);
  });

  await t.test('notifications: no reading or marking a colleague\'s direct message; read-all; no readBy leak', async () => {
    const amy = await createUser('amy');
    const ben = await createUser('ben');
    const toBen = await Notification.create({ tenantId: TENANT, title: 'Salary revised', message: 'Ben, your CTC changed', audienceType: 'User', audienceValue: ben.user._id, createdBy: ben.user._id } as any);
    await Notification.create({ tenantId: TENANT, title: 'Holiday', message: 'Office closed Friday', audienceType: 'All', priority: 'High', createdBy: ben.user._id } as any);

    const peek = await request(app).put(`/api/v1/communication/notifications/${toBen._id}/read`).set('Authorization', amy.token);
    assert.equal(peek.status, 404);
    assert.ok(!JSON.stringify(peek.body).includes('CTC'));
    assert.equal((await request(app).post(`/api/v1/me/notifications/${toBen._id}/read`).set('Authorization', amy.token)).status, 404);

    const amyFeed = await request(app).get('/api/v1/me/notifications').set('Authorization', amy.token);
    assert.equal(amyFeed.body.items.length, 1);
    assert.deepEqual(amyFeed.body.summary, { total: 1, unread: 1, important: 1, thisWeek: 1 });

    const benFeed = await request(app).get('/api/v1/me/notifications?status=unread&kind=direct').set('Authorization', ben.token);
    assert.equal(benFeed.body.items.length, 1);
    assert.equal((await request(app).post('/api/v1/me/notifications/read-all').set('Authorization', ben.token)).body.updated, 2);
    const after = await request(app).get('/api/v1/me/notifications').set('Authorization', ben.token);
    assert.equal(after.body.summary.unread, 0);
    assert.ok(after.body.items.every((n: any) => n.isRead && n.readBy === undefined));

    const legacy = await request(app).get('/api/v1/communication/notifications/mine').set('Authorization', ben.token);
    assert.ok(legacy.body.every((n: any) => n.readBy === undefined && n.isRead === true));
  });

  await t.test('tasks: managers delegate to direct reports only; assignees change status, not wording', async () => {
    const boss = await createUser('boss');
    const report = await createUser('report', undefined, { reportingToId: boss.user._id });
    const stranger = await createUser('stranger');

    const team = await request(app).get('/api/v1/me/team').set('Authorization', boss.token);
    assert.deepEqual(team.body.map((u: any) => u.firstName), ['report']);

    assert.equal((await request(app).post('/api/v1/todos/assign').set('Authorization', boss.token)
      .send({ assigneeId: String(stranger.user._id), title: 'Not yours' })).status, 403);

    const assigned = await request(app).post('/api/v1/todos/assign').set('Authorization', boss.token)
      .send({ assigneeId: String(report.user._id), title: 'Prepare Q3 report', priority: 'High', relatedTo: 'Sales' });
    assert.equal(assigned.status, 201, JSON.stringify(assigned.body));
    const id = assigned.body.todo._id;

    const list = await request(app).get('/api/v1/todos').set('Authorization', report.token);
    assert.equal(list.body[0].assignedBy.firstName, 'boss');

    assert.equal((await request(app).put(`/api/v1/todos/${id}`).set('Authorization', report.token).send({ title: 'Skip it' })).status, 403);
    assert.equal((await request(app).delete(`/api/v1/todos/${id}`).set('Authorization', report.token)).status, 403);
    assert.equal((await request(app).put(`/api/v1/todos/${id}`).set('Authorization', report.token).send({ status: 'In_Progress' })).status, 200);
    assert.equal((await request(app).put(`/api/v1/todos/${id}`).set('Authorization', report.token).send({ status: 'Completed' })).body.todo.status, 'Completed');

    const bossFeed = await request(app).get('/api/v1/me/notifications').set('Authorization', boss.token);
    assert.match(bossFeed.body.items[0].title, /Task completed/);

    // Own tasks stay fully editable.
    const own = await request(app).post('/api/v1/todos').set('Authorization', report.token).send({ title: 'Book train' });
    assert.equal((await request(app).put(`/api/v1/todos/${own.body.todo._id}`).set('Authorization', report.token).send({ title: 'Book flight' })).body.todo.title, 'Book flight');
    assert.equal((await request(app).delete(`/api/v1/todos/${own.body.todo._id}`).set('Authorization', report.token)).status, 200);
  });
});
