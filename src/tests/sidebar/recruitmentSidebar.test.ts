import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectTestDB, disconnectTestDB, clearTestDB } from '../testUtils/setup';
import { SidebarConfig } from '../../models/SidebarConfig';
import { syncSidebarDefaults } from '../../utils/seedSync';
import { DEFAULT_SIDEBAR_ITEMS } from '../../utils/sidebarDefaults';

// Recruitment Process sidebar: "New Job" opened the jobs list and "Interview Statistics"
// opened the generic reports page. New tenants get the right links from the defaults;
// existing tenants are corrected by the sync, unless an admin changed the link.

const find = (tenantId: string, label: string) =>
  SidebarConfig.findOne({ tenantId, section: 'Recruitment Process', label } as any).lean() as any;

test('recruitment process sidebar links', async (t) => {
  await connectTestDB();
  t.after(disconnectTestDB);
  t.afterEach(clearTestDB);

  await t.test('defaults point at the right pages', () => {
    const rp = (label: string) => DEFAULT_SIDEBAR_ITEMS.find((i) => i.section === 'Recruitment Process' && i.label === label);
    assert.equal(rp('New Job')?.href, '/dashboard/hiring/jobs/new');
    assert.equal(rp('Interview Statistics')?.href, '/dashboard/hiring/interviews/statistics');
    assert.equal(rp('HOD Evaluation')?.href, '/dashboard/hiring/hod-evaluation');
  });

  await t.test('existing tenants on the old links are corrected; customised links are kept', async () => {
    const stale = String(new mongoose.Types.ObjectId());
    const custom = String(new mongoose.Types.ObjectId());
    for (const [tenantId, newJobHref] of [[stale, '/dashboard/hiring/jobs'], [custom, '/dashboard/my-own-jobs-page']]) {
      await SidebarConfig.create({ tenantId, section: 'Recruitment Process', label: 'New Job', href: newJobHref, icon: 'PlusSquare', order: 3 } as any);
      await SidebarConfig.create({ tenantId, section: 'Recruitment Process', label: 'Interview Statistics', href: '/dashboard/report-analytics', icon: 'TrendingUp', order: 8 } as any);
      await syncSidebarDefaults(tenantId);
    }

    assert.equal((await find(stale, 'New Job')).href, '/dashboard/hiring/jobs/new');
    assert.equal((await find(stale, 'Interview Statistics')).href, '/dashboard/hiring/interviews/statistics');
    assert.equal((await find(custom, 'New Job')).href, '/dashboard/my-own-jobs-page');
  });
});
