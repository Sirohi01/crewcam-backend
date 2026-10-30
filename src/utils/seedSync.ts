import { SidebarConfig } from '../models/SidebarConfig';
import { DashboardWidgetConfig } from '../models/DashboardWidgetConfig';
import { DEFAULT_SIDEBAR_ITEMS, SECTION_ORDER } from './sidebarDefaults';
import { DEFAULT_DASHBOARD_WIDGETS } from './dashboardWidgetDefaults';
import { Role, RoleScope, RoleLoginType } from '../models/Role';

/** Every tenant's baseline role set — created once per tenant so a fresh company never
 * starts with only "Company Admin" and has to invent HR Manager / Employee by hand. */
const DEFAULT_TENANT_ROLES: Array<{ name: string; description: string; permissions: string[]; scope: RoleScope; loginType: RoleLoginType }> = [
  { name: 'Company Admin', description: 'Full access to company operations', permissions: ['*'], scope: 'company', loginType: 'employer' },
  {
    name: 'HR Manager', description: 'Manages recruitment, employee records, attendance and leave for the company',
    permissions: [
      'ATS_READ', 'ATS_WRITE', 'EMPLOYEE_READ', 'EMPLOYEE_WRITE', 'ORG_READ',
      'ATTENDANCE_SECTION_HR_OVERRIDE_READ', 'ATTENDANCE_SECTION_HR_OVERRIDE_WRITE',
      'ATTENDANCE_SECTION_LEAVES_READ', 'ATTENDANCE_SECTION_LEAVES_WRITE',
      'SUPPORT_READ', 'MASTER_READ',
    ],
    scope: 'company', loginType: 'employer',
  },
  { name: 'Employee', description: 'Standard employee self-service access', permissions: ['profile_read', 'attendance_read'], scope: 'self', loginType: 'employee' },
];

/** Idempotent — upserts each role by (tenantId, name) via $setOnInsert, so re-running this
 * for an existing tenant never overwrites permissions an admin has since customized. */
export const seedDefaultTenantRoles = async (tenantId: string, createdBy?: unknown) => {
  const roles: Record<string, any> = {};
  for (const def of DEFAULT_TENANT_ROLES) {
    const role = await Role.findOneAndUpdate(
      { tenantId: String(tenantId), name: def.name } as any,
      { $setOnInsert: { ...def, tenantId: String(tenantId), ...(createdBy ? { createdBy } : {}) } },
      { upsert: true, new: true }
    );
    roles[def.name] = role;
  }
  return roles;
};
export const syncSidebarDefaults = async (tenantId: string) => {
  const rawExisting = await SidebarConfig.find({ tenantId }, { section: 1, label: 1, sectionOrder: 1, href: 1, order: 1 });

  // Self-heal duplicate (section, label) rows — these can appear when several
  // concurrent requests (multiple tabs / rapid reloads) each raced through the
  // missing-item insert below before any single one had committed. Keep the
  // oldest row per key, drop the rest.
  const seenKeys = new Set<string>();
  const duplicateIds: string[] = [];
  const existing = rawExisting.filter((item) => {
    const key = `${item.section}::${item.label}`;
    if (seenKeys.has(key)) {
      duplicateIds.push(String(item._id));
      return false;
    }
    seenKeys.add(key);
    return true;
  });
  if (duplicateIds.length > 0) {
    await SidebarConfig.deleteMany({ tenantId, _id: { $in: duplicateIds } } as any);
  }

  // One-time label renames (old label -> new label, matching a page rename). Rename in
  // place rather than letting the missing-item insert below create a duplicate row for
  // existing tenants. If a row with the new label already exists (e.g. a previous run
  // already renamed it, or it was freshly upserted), the old-labeled row is just a
  // leftover — delete it instead of renaming into a collision.
  const LABEL_RENAMES: Array<{ section: string; from: string; to: string }> = [
    { section: 'Hiring Process', from: 'Interview Round', to: 'Interview Round - 3' },
    { section: 'Hiring Process', from: 'Written Assessment', to: 'Interview Round - 4' },
  ];
  for (const rename of LABEL_RENAMES) {
    const legacyItem = existing.find((i) => i.section === rename.section && i.label === rename.from);
    if (!legacyItem) continue;
    const alreadyRenamed = existing.some((i) => i.section === rename.section && i.label === rename.to);
    if (alreadyRenamed) {
      await SidebarConfig.deleteOne({ _id: legacyItem._id, tenantId } as any);
      const idx = existing.indexOf(legacyItem);
      if (idx !== -1) existing.splice(idx, 1);
    } else {
      await SidebarConfig.updateOne({ _id: legacyItem._id, tenantId } as any, { label: rename.to });
      legacyItem.label = rename.to;
    }
  }

  // Purge any legacy requirement items or manpower requests from "Hiring Process"
  await SidebarConfig.deleteMany({
    tenantId,
    section: 'Hiring Process',
    label: { $in: ['Career', 'Recruiter Dashboard', 'Job Requisition', 'Post New Job', 'Step 1 - Manpower Requests', 'Step 1 - Manpower Request'] }
  } as any);

  // Remove purged items from in-memory existing list
  for (let i = existing.length - 1; i >= 0; i--) {
    if (existing[i].section === 'Hiring Process' && ['Career', 'Recruiter Dashboard', 'Job Requisition', 'Post New Job', 'Step 1 - Manpower Requests'].includes(existing[i].label)) {
      existing.splice(i, 1);
    }
  }

  // Migrate Requirement items from "Hiring Process" to "Requirement"
  const REQUIREMENT_MIGRATION_LABELS = ['Career', 'Recruiter Dashboard', 'Job Requisition', 'Post New Job'];
  for (const label of REQUIREMENT_MIGRATION_LABELS) {
    const hiringItem = existing.find((i) => i.section === 'Hiring Process' && i.label === label);
    if (!hiringItem) continue;
    const reqItem = existing.find((i) => i.section === 'Requirement' && i.label === label);
    if (reqItem) {
      await SidebarConfig.deleteOne({ _id: hiringItem._id, tenantId } as any);
      const idx = existing.indexOf(hiringItem);
      if (idx !== -1) existing.splice(idx, 1);
    } else {
      await SidebarConfig.updateOne(
        { _id: hiringItem._id, tenantId } as any,
        { section: 'Requirement', sectionOrder: SECTION_ORDER['Requirement'] ?? 4 }
      );
      hiringItem.section = 'Requirement';
      hiringItem.sectionOrder = SECTION_ORDER['Requirement'] ?? 4;
    }
  }

  const existingByKey = new Map(existing.map((i) => [`${i.section}::${i.label}`, i]));

  // Upsert (not blind insertMany) so concurrent calls can't each decide an item is
  // "missing" and every one of them insert its own duplicate copy.
  const missing = DEFAULT_SIDEBAR_ITEMS.filter((item) => !existingByKey.has(`${item.section}::${item.label}`));
  if (missing.length > 0) {
    await SidebarConfig.bulkWrite(missing.map((item) => ({
      updateOne: {
        filter: { tenantId, section: item.section, label: item.label } as any,
        update: { $setOnInsert: { ...item, sectionOrder: SECTION_ORDER[item.section] ?? 999, tenantId } },
        upsert: true,
      },
    })));
  }

  const sectionsNeedingFix = existing.filter((i) => i.sectionOrder !== SECTION_ORDER[i.section]);
  await Promise.all(
    [...new Set(sectionsNeedingFix.map((i) => i.section))].map((section) =>
      SidebarConfig.updateMany({ tenantId, section } as any, { sectionOrder: SECTION_ORDER[section] ?? 999 })
    )
  );
  const graduations = DEFAULT_SIDEBAR_ITEMS.filter((item) => {
    const current = existingByKey.get(`${item.section}::${item.label}`);
    return current && current.href !== item.href && current.href?.includes('/coming-soon') && !item.href?.includes('/coming-soon');
  });
  await Promise.all(
    graduations.map((item) =>
      SidebarConfig.updateOne({ tenantId, section: item.section, label: item.label } as any, { href: item.href })
    )
  );

  const flatRouteUpdates = DEFAULT_SIDEBAR_ITEMS.filter((item) => {
    const current = existingByKey.get(`${item.section}::${item.label}`);
    return current && current.href !== item.href && (
      current.href?.includes('/attendance/') ||
      current.href?.includes('/leaves/') ||
      current.href?.includes('/communication/')
    );
  });
  await Promise.all(
    flatRouteUpdates.map((item) =>
      SidebarConfig.updateOne({ tenantId, section: item.section, label: item.label } as any, { href: item.href })
    )
  );
  const hiringRouteGraduations = DEFAULT_SIDEBAR_ITEMS.filter((item) => {
    const current = existingByKey.get(`${item.section}::${item.label}`);
    return item.section === 'Hiring Process'
      && item.label.startsWith('Step ')
      && current?.href === '/dashboard/hiring'
      && item.href !== '/dashboard/hiring';
  });
  await Promise.all(
    hiringRouteGraduations.map((item) =>
      SidebarConfig.updateOne({ tenantId, section: item.section, label: item.label } as any, { href: item.href })
    )
  );
  const hiringStepHrefFixes = DEFAULT_SIDEBAR_ITEMS.filter((item) => {
    const current = existingByKey.get(`${item.section}::${item.label}`);
    return item.section === 'Hiring Process' && item.label.startsWith('Step ') && current && current.href !== item.href;
  });
  await Promise.all(
    hiringStepHrefFixes.map((item) =>
      SidebarConfig.updateOne({ tenantId, section: item.section, label: item.label } as any, { href: item.href })
    )
  );
  const existingPipeline = existingByKey.get('Hiring Process::Candidate Pipeline');
  if (existingPipeline?.href === '/dashboard/hiring') {
    await SidebarConfig.updateOne(
      { tenantId, section: 'Hiring Process', label: 'Candidate Pipeline' } as any,
      { href: '/dashboard/hiring/pipeline' }
    );
  }
  const hiringDefaults = DEFAULT_SIDEBAR_ITEMS.filter((item) => item.section === 'Hiring Process');
  await Promise.all(hiringDefaults.map((item) => {
    const current = existingByKey.get(`${item.section}::${item.label}`);
    const isLegacyDefault = current && current.href && (
      current.href === '/dashboard/hiring' ||
      current.href?.includes('/coming-soon') ||
      current.href === item.href
    );
    return isLegacyDefault && current.order !== item.order
      ? SidebarConfig.updateOne({ tenantId, section: item.section, label: item.label } as any, { order: item.order })
      : Promise.resolve();
  }));
  const currentKeys = new Set(DEFAULT_SIDEBAR_ITEMS.map((item) => `${item.section}::${item.label}`));
  const staleDuplicates = existing.filter(
    (i) =>
      i.section === 'Admin Section' &&
      !currentKeys.has(`${i.section}::${i.label}`) &&
      (i.href === '/dashboard/company' || i.href === '/dashboard/master')
  );
  if (staleDuplicates.length > 0) {
    await SidebarConfig.deleteMany({ tenantId, _id: { $in: staleDuplicates.map((i) => i._id) } } as any);
  }

  const RETIRED_SECTION_LABELS: Array<{ section: string; label?: string }> = [
    { section: 'Admin Section', label: 'Add JD' }, // replaced by Company Setup > Master Data > JD Library
    { section: 'Admin Section', label: 'Add KRA' }, // replaced by Company Setup > Master Data > KPA Library
    { section: 'Hiring Process', label: 'Add New Interview' }, // merged into single "Interviews" page (add + list combined)
    { section: 'Hiring Process', label: 'Add Candidate' }, // legacy label for the same page now seeded as "Candidate" — was showing as a duplicate row
    { section: 'Hiring Process', label: 'Interview List' }, // renamed to "Interviews" (same page, now add + list combined)
    { section: 'Company Setup' }, // entirely replaced by Organization Setup
    { section: 'Support & Operations', label: 'Asset Management' }, // duplicate of Company Setup > Master Data > Company Assets (same /dashboard/support/assets page)
    { section: 'Attendance Section', label: 'All Crewcam Leave' }, // duplicate of "Add Employee Leave" (/dashboard/leaves)
    { section: 'Interview & Selection' }, // whole section merged into "Hiring Process"
    { section: 'HR & Admin Department', label: 'Current Employee List' }, // duplicate of People > Employees
    { section: 'Accounts Department', label: 'Employee Salary Slips' }, // duplicate of Finance & Legal > Payroll & Slips
    { section: 'Meeting Section', label: 'Add Local Meeting' }, // collapsed into single "Meetings" row
    { section: 'Meeting Section', label: 'Add Outstation Meeting' },
    { section: 'Meeting Section', label: 'Scheduled Meeting' },
    { section: 'Meeting Section', label: 'Completed Meeting' },
    { section: 'Meeting Section', label: 'Meeting MoM' },
    { section: 'Agreement Section', label: 'Create New Company' },
    { section: 'Attendance Section', label: 'Individual Attendance' },
    { section: 'Attendance Section', label: 'Today Attendance' },
    { section: 'Attendance Section', label: 'Add HR Attendance' },
    { section: 'Attendance Section', label: 'Add Employee Out-In' },
    { section: 'Attendance Section', label: 'Employee Leave Statistics' },
    { section: 'Attendance Section', label: 'Add Employee Leave' },
    { section: 'Communications', label: 'Employee Live Tracking' },
  ];
  const toRetire = existing.filter((i) =>
    RETIRED_SECTION_LABELS.some((r) => i.section === r.section && (r.label === undefined || i.label === r.label))
  );
  if (toRetire.length > 0) {
    await SidebarConfig.deleteMany({ tenantId, _id: { $in: toRetire.map((i) => i._id) } } as any);
  }
};
export const syncDashboardWidgetDefaults = async (tenantId: string) => {
  const existing = await DashboardWidgetConfig.find({ tenantId }, { widgetKey: 1 });
  const existingKeys = new Set(existing.map((w) => w.widgetKey));

  const missing = DEFAULT_DASHBOARD_WIDGETS.filter((w) => !existingKeys.has(w.widgetKey));
  if (missing.length > 0) {
    await DashboardWidgetConfig.bulkWrite(missing.map((w) => ({
      updateOne: {
        filter: { tenantId, widgetKey: w.widgetKey } as any,
        update: { $setOnInsert: { ...w, tenantId } },
        upsert: true,
      },
    })));
  }
};
