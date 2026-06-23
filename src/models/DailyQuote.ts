import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IDailyQuote extends Document, IAuditable {
  tenantId: Types.ObjectId;
  text: string;
  author?: string;
  scheduledDate: Date;
  isActive: boolean;
}

const dailyQuoteSchema = new Schema<IDailyQuote>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  text: { type: String, required: true },
  author: { type: String },
  scheduledDate: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

dailyQuoteSchema.plugin(tenantPlugin);
dailyQuoteSchema.plugin(auditPlugin);

export const DailyQuote = mongoose.model<IDailyQuote>('DailyQuote', dailyQuoteSchema);
