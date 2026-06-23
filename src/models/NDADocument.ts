import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface INDADocument extends ITenantScoped {
  candidateId: Types.ObjectId;
  employeeId?: Types.ObjectId;
  documentContent?: string;
  pdfUrl?: string;
  signedStatus: 'Pending' | 'Signed';
  signedDate?: Date;
  signatureIp?: string;
  issuedBy: Types.ObjectId;
}

const ndaDocumentSchema = new Schema<INDADocument>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'User' },
  documentContent: { type: String },
  pdfUrl: { type: String },
  signedStatus: { type: String, enum: ['Pending', 'Signed'], default: 'Pending' },
  signedDate: { type: Date },
  signatureIp: { type: String },
  issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

ndaDocumentSchema.plugin(tenantPlugin);

export const NDADocument = mongoose.model<INDADocument>('NDADocument', ndaDocumentSchema);
