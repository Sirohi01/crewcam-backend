import mongoose, { Schema } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';
import { ROLE_CATEGORIES } from './Role';

export interface IDashboardWidgetConfig extends ITenantScoped, IAuditable {
  category: string;
  widgetKey: string;
  order: number;
  isActive: boolean;
}

const DashboardWidgetConfigSchema = new Schema<IDashboardWidgetConfig>({
  category: { type: String, enum: ROLE_CATEGORIES, required: true },
  widgetKey: { type: String, required: true },
  order: { type: Number, required: true, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

DashboardWidgetConfigSchema.index({ tenantId: 1, category: 1, widgetKey: 1 }, { unique: true });

DashboardWidgetConfigSchema.plugin(tenantPlugin);
DashboardWidgetConfigSchema.plugin(auditPlugin);

export const DashboardWidgetConfig = mongoose.model<IDashboardWidgetConfig>(
  'DashboardWidgetConfig',
  DashboardWidgetConfigSchema
);
