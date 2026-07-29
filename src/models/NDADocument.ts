import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface INDADocument extends ITenantScoped {
  candidateName?: string;
  fatherName?: string;
  age?: string;
  department?: string;
  designation?: string;
  residentOf1?: string;
  residentOf2?: string;
  witness1Name?: string;
  witness1Address?: string;
  witness1Date?: string;
  witness2Name?: string;
  witness2Address?: string;
  witness2Date?: string;

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
  candidateName: { type: String },
  fatherName: { type: String },
  age: { type: String },
  department: { type: String },
  designation: { type: String },
  residentOf1: { type: String },
  residentOf2: { type: String },
  witness1Name: { type: String },
  witness1Address: { type: String },
  witness1Date: { type: String },
  witness2Name: { type: String },
  witness2Address: { type: String },
  witness2Date: { type: String },

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
