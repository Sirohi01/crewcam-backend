import { RoleCategory } from '../models/Role';

export interface DashboardWidgetDefault {
  category: RoleCategory;
  widgetKey: string;
  order: number;
}

/**
 * Default widget set per persona category, per docs/03_ROLES_DASHBOARDS_PERMISSIONS.md §2.
 * The full module map is seeded now (same "show full scope up front" decision as the
 * sidebar) — widgets without a real query yet fall through getWidgetData's default case
 * and return `{ dataAvailable: false }` until their owning phase wires the real data.
 */
export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgetDefault[] = [
  { category: 'employee', widgetKey: 'my-attendance-today', order: 0 },
  { category: 'employee', widgetKey: 'my-leave-balance', order: 1 },
  { category: 'employee', widgetKey: 'my-todo', order: 2 },

  { category: 'reporting_manager', widgetKey: 'team-attendance-today', order: 0 },
  { category: 'reporting_manager', widgetKey: 'pending-approvals', order: 1 },
  { category: 'reporting_manager', widgetKey: 'meetings-summary', order: 2 },
  { category: 'reporting_manager', widgetKey: 'my-todo', order: 3 },

  { category: 'hod', widgetKey: 'department-attendance', order: 0 },
  { category: 'hod', widgetKey: 'department-headcount', order: 1 },
  { category: 'hod', widgetKey: 'pending-approvals', order: 2 },
  { category: 'hod', widgetKey: 'pms-appraisal-status', order: 3 },

  { category: 'hr', widgetKey: 'org-headcount', order: 0 },
  { category: 'hr', widgetKey: 'hiring-pipeline-summary', order: 1 },
  { category: 'hr', widgetKey: 'pending-approvals', order: 2 },
  { category: 'hr', widgetKey: 'meetings-summary', order: 3 },
  { category: 'hr', widgetKey: 'communications-summary', order: 4 },
  { category: 'hr', widgetKey: 'disciplinary-cases-open', order: 5 },
  { category: 'hr', widgetKey: 'exit-formalities-pending', order: 6 },
  { category: 'hr', widgetKey: 'pms-appraisal-status', order: 7 },

  { category: 'hr_admin', widgetKey: 'org-headcount', order: 0 },
  { category: 'hr_admin', widgetKey: 'hiring-pipeline-summary', order: 1 },
  { category: 'hr_admin', widgetKey: 'pending-approvals', order: 2 },
  { category: 'hr_admin', widgetKey: 'disciplinary-cases-open', order: 3 },
  { category: 'hr_admin', widgetKey: 'exit-formalities-pending', order: 4 },
  { category: 'hr_admin', widgetKey: 'master-data-health', order: 5 },

  { category: 'finance', widgetKey: 'payroll-pending', order: 0 },
  { category: 'finance', widgetKey: 'obligations-due', order: 1 },
  { category: 'finance', widgetKey: 'agreements-active', order: 2 },

  { category: 'admin', widgetKey: 'org-headcount', order: 0 },
  { category: 'admin', widgetKey: 'master-data-health', order: 1 },

  { category: 'company_admin', widgetKey: 'org-headcount', order: 0 },
  { category: 'company_admin', widgetKey: 'tenant-feature-usage', order: 1 },
  { category: 'company_admin', widgetKey: 'hiring-pipeline-summary', order: 2 },
  { category: 'company_admin', widgetKey: 'payroll-pending', order: 3 },
  { category: 'company_admin', widgetKey: 'obligations-due', order: 4 },
  { category: 'company_admin', widgetKey: 'meetings-summary', order: 5 },
  { category: 'company_admin', widgetKey: 'communications-summary', order: 6 },
  { category: 'company_admin', widgetKey: 'agreements-active', order: 7 },
  { category: 'company_admin', widgetKey: 'master-data-health', order: 8 },

  { category: 'developer', widgetKey: 'developer-tasks', order: 0 },
  { category: 'developer', widgetKey: 'my-todo', order: 1 },
];
