import { SidebarConfig } from '../models/SidebarConfig';
import { DashboardWidgetConfig } from '../models/DashboardWidgetConfig';
import { DEFAULT_SIDEBAR_ITEMS, SECTION_ORDER } from './sidebarDefaults';
import { DEFAULT_DASHBOARD_WIDGETS } from './dashboardWidgetDefaults';
export const syncSidebarDefaults = async (tenantId: string) => {
  const existing = await SidebarConfig.find({ tenantId }, { section: 1, label: 1, sectionOrder: 1, href: 1, order: 1 });

  // One-time rename: "Step 1 - Manpower Requests" -> "Job Requisition" (matches the
  // new Create Job Requisition page). Rename in place rather than letting the
  // missing-item insert below create a duplicate row for existing tenants.
  const legacyManpowerItem = existing.find((i) => i.section === 'Hiring Process' && i.label === 'Step 1 - Manpower Requests');
  if (legacyManpowerItem) {
    await SidebarConfig.updateOne({ _id: legacyManpowerItem._id } as any, { label: 'Job Requisition' });
    legacyManpowerItem.label = 'Job Requisition';
  }

  const existingByKey = new Map(existing.map((i) => [`${i.section}::${i.label}`, i]));

  const missing = DEFAULT_SIDEBAR_ITEMS.filter((item) => !existingByKey.has(`${item.section}::${item.label}`));
  if (missing.length > 0) {
    await SidebarConfig.insertMany(missing.map((item) => ({ ...item, sectionOrder: SECTION_ORDER[item.section] ?? 999, tenantId })));
  }

  const sectionsNeedingFix = existing.filter((i) => i.sectionOrder !== SECTION_ORDER[i.section]);
  await Promise.all(
    [...new Set(sectionsNeedingFix.map((i) => i.section))].map((section) =>
      SidebarConfig.updateMany({ tenantId, section } as any, { sectionOrder: SECTION_ORDER[section] ?? 999 })
    )
  );
  const graduations = DEFAULT_SIDEBAR_ITEMS.filter((item) => {
    const current = existingByKey.get(`${item.section}::${item.label}`);
    return current && current.href !== item.href && current.href.includes('/coming-soon') && !item.href.includes('/coming-soon');
  });
  await Promise.all(
    graduations.map((item) =>
      SidebarConfig.updateOne({ tenantId, section: item.section, label: item.label } as any, { href: item.href })
    )
  );

  const flatRouteUpdates = DEFAULT_SIDEBAR_ITEMS.filter((item) => {
    const current = existingByKey.get(`${item.section}::${item.label}`);
    return current && current.href !== item.href && (
      current.href.includes('/attendance/') ||
      current.href.includes('/leaves/') ||
      current.href.includes('/communication/')
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
    const isLegacyDefault = current && (
      current.href === '/dashboard/hiring' ||
      current.href.includes('/coming-soon') ||
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
    { section: 'Hiring Process', label: 'Interview List' }, // renamed to "Interviews" (same page, now add + list combined)
    { section: 'Company Setup', label: 'Organization' }, // split into branches, departments, designations
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
  const existing = await DashboardWidgetConfig.find({ tenantId }, { category: 1, widgetKey: 1 });
  const existingKeys = new Set(existing.map((w) => `${w.category}::${w.widgetKey}`));

  const missing = DEFAULT_DASHBOARD_WIDGETS.filter((w) => !existingKeys.has(`${w.category}::${w.widgetKey}`));
  if (missing.length > 0) {
    await DashboardWidgetConfig.insertMany(missing.map((w) => ({ ...w, tenantId })));
  }
};
