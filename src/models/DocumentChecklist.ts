import mongoose, { Schema, Document, Types } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';

export interface IChecklistItem {
  documentName: string;
  isMandatory: boolean;
  status: 'Pending' | 'Submitted' | 'Verified' | 'Rejected';
  fileUrl?: string;
  remarks?: string;
  verifiedBy?: Types.ObjectId;
  verifiedAt?: Date;
}

export interface IDocumentChecklist extends ITenantScoped {
  candidateId: Types.ObjectId;
  items: IChecklistItem[];
  overallStatus: 'Incomplete' | 'Complete' | 'Verified';
}

const documentChecklistSchema = new Schema<IDocumentChecklist>({
  candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
  items: [{
    documentName: { type: String, required: true },
    isMandatory: { type: Boolean, default: true },
    status: { type: String, enum: ['Pending', 'Submitted', 'Verified', 'Rejected'], default: 'Pending' },
    fileUrl: { type: String },
    remarks: { type: String },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date }
  }],
  overallStatus: { type: String, enum: ['Incomplete', 'Complete', 'Verified'], default: 'Incomplete' }
}, { timestamps: true });

documentChecklistSchema.plugin(tenantPlugin);

export const DocumentChecklist = mongoose.model<IDocumentChecklist>('DocumentChecklist', documentChecklistSchema);
