import mongoose, { Schema } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';
import { ROLE_SCOPES } from './Role';

export interface IDashboardWidgetConfig extends ITenantScoped, IAuditable {
  widgetKey: string;
  order: number;
  // Scope threshold: any role whose scope rank is >= this widget's minScope rank sees it
  // by default (e.g. minScope 'department' shows to department/branch/company-scoped roles).
  minScope: string;
  // Opt-in extra allow-list on top of minScope — grants specific roles access to a widget
  // even if their scope wouldn't normally qualify (e.g. showing "payroll-pending" to a
  // specific "Payroll Executive" role without opening it to every company-scope role).
  roleIds: mongoose.Types.ObjectId[];
  isActive: boolean;
}

const DashboardWidgetConfigSchema = new Schema<IDashboardWidgetConfig>({
  widgetKey: { type: String, required: true },
  order: { type: Number, required: true, default: 0 },
  minScope: { type: String, enum: ROLE_SCOPES, default: 'self' },
  roleIds: [{ type: Schema.Types.ObjectId, ref: 'Role' }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

DashboardWidgetConfigSchema.index({ tenantId: 1, widgetKey: 1 }, { unique: true });

DashboardWidgetConfigSchema.plugin(tenantPlugin);
DashboardWidgetConfigSchema.plugin(auditPlugin);

export const DashboardWidgetConfig = mongoose.model<IDashboardWidgetConfig>(
  'DashboardWidgetConfig',
  DashboardWidgetConfigSchema
);
