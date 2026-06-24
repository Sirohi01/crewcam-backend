import mongoose, { Schema, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IHiringGeneratedPdf extends ITenantScoped {
  recordType: string;
  recordId: Types.ObjectId;
  pdfUrl: string;
}

const schema = new Schema<IHiringGeneratedPdf>({
  recordType: { type: String, required: true, index: true },
  recordId: { type: Schema.Types.ObjectId, required: true, index: true },
  pdfUrl: { type: String, required: true },
}, { timestamps: true });
schema.index({ tenantId: 1, recordType: 1, recordId: 1 }, { unique: true });
schema.plugin(tenantPlugin);

export const HiringGeneratedPdf = mongoose.model<IHiringGeneratedPdf>('HiringGeneratedPdf', schema);
