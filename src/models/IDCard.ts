import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IIDCard extends ITenantScoped {
  employeeId: Types.ObjectId;
  cardType: 'ID Card' | 'Visiting Card';
  employeeCode?: string;
  designation?: string;
  departmentId?: Types.ObjectId;
  bloodGroup?: string;
  validFrom?: Date;
  validTo?: Date;
  photoUrl?: string;
  cardTheme?: string;
  frontLabel?: string;
  backNote?: string;
  qrPayload?: string;
  pdfUrl?: string;
  status: 'Pending' | 'Generated' | 'Printed' | 'Issued';
  issuedDate?: Date;
  issuedBy: Types.ObjectId;
}

const idCardSchema = new Schema<IIDCard>({
  employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  cardType: { type: String, enum: ['ID Card', 'Visiting Card'], default: 'ID Card' },
  employeeCode: { type: String },
  designation: { type: String },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
  bloodGroup: { type: String },
  validFrom: { type: Date },
  validTo: { type: Date },
  photoUrl: { type: String },
  cardTheme: { type: String, default: '#0e4778' },
  frontLabel: { type: String, default: 'EMPLOYEE IDENTITY CARD' },
  backNote: { type: String, default: 'Scan this QR code to verify employee identity.' },
  qrPayload: { type: String },
  pdfUrl: { type: String },
  status: { type: String, enum: ['Pending', 'Generated', 'Printed', 'Issued'], default: 'Pending' },
  issuedDate: { type: Date },
  issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

idCardSchema.plugin(tenantPlugin);

export const IDCard = mongoose.model<IIDCard>('IDCard', idCardSchema);
