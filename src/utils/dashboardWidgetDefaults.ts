import { RoleScope } from '../models/Role';

export interface DashboardWidgetDefault {
  widgetKey: string;
  order: number;
  minScope: RoleScope;
}

/**
 * Default widget set, per docs/03_ROLES_DASHBOARDS_PERMISSIONS.md §2. One row per unique
 * widget (not per persona) — `minScope` is the lowest data-scope that sees it by default;
 * a tenant admin can widen/narrow further with per-role overrides on the Dashboard Widgets
 * settings page. Widgets without a real query yet fall through getWidgetData's default
 * case and return `{ dataAvailable: false }` until their owning phase wires the real data.
 */
export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgetDefault[] = [
  { widgetKey: 'my-attendance-today', order: 0, minScope: 'self' },
  { widgetKey: 'my-leave-balance', order: 1, minScope: 'self' },
  { widgetKey: 'my-todo', order: 2, minScope: 'self' },

  { widgetKey: 'team-attendance-today', order: 10, minScope: 'team' },
  { widgetKey: 'meetings-summary', order: 11, minScope: 'team' },
  { widgetKey: 'pending-approvals', order: 12, minScope: 'team' },

  { widgetKey: 'department-attendance', order: 20, minScope: 'department' },
  { widgetKey: 'department-headcount', order: 21, minScope: 'department' },
  { widgetKey: 'pms-appraisal-status', order: 22, minScope: 'department' },

  { widgetKey: 'org-headcount', order: 30, minScope: 'company' },
  { widgetKey: 'hiring-pipeline-summary', order: 31, minScope: 'company' },
  { widgetKey: 'communications-summary', order: 32, minScope: 'company' },
  { widgetKey: 'disciplinary-cases-open', order: 33, minScope: 'company' },
  { widgetKey: 'exit-formalities-pending', order: 34, minScope: 'company' },
  { widgetKey: 'master-data-health', order: 35, minScope: 'company' },
  { widgetKey: 'payroll-pending', order: 36, minScope: 'company' },
  { widgetKey: 'obligations-due', order: 37, minScope: 'company' },
  { widgetKey: 'agreements-active', order: 38, minScope: 'company' },
  { widgetKey: 'tenant-feature-usage', order: 39, minScope: 'company' },

  // Genuinely job-specific rather than scope-driven — defaults to the top scope tier as a
  // safe ceiling, but stays effectively hidden until a tenant admin opts a specific role in
  // via roleIds on the Dashboard Widgets settings page.
  { widgetKey: 'developer-tasks', order: 40, minScope: 'company' },
];
