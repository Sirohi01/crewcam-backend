import mongoose, { Document, Schema } from 'mongoose';

export interface IDivision extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  code: string;
  businessUnit?: mongoose.Types.ObjectId;
  headEmployeeId?: mongoose.Types.ObjectId;
  parentDivisionId?: mongoose.Types.ObjectId;
  isActive: boolean;
  description?: string;
  totalEmployees?: string;
  totalDepartments?: string;
  budget?: string;
  keyResponsibilities?: string;
  reportToId?: mongoose.Types.ObjectId;
  linkedDepartments?: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const DivisionSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true },
    code: { type: String, required: true },
    businessUnit: { type: Schema.Types.ObjectId, ref: 'BusinessUnit' },
    headEmployeeId: { type: Schema.Types.ObjectId, ref: 'User' },
    parentDivisionId: { type: Schema.Types.ObjectId, ref: 'Division' },
    isActive: { type: Boolean, default: true },
    description: { type: String },
    totalEmployees: { type: String },
    totalDepartments: { type: String },
    budget: { type: String },
    keyResponsibilities: { type: String },
    reportToId: { type: Schema.Types.ObjectId, ref: 'User' },
    linkedDepartments: [{ type: Schema.Types.ObjectId, ref: 'Department' }]
  },
  { timestamps: true }
);

DivisionSchema.index({ tenantId: 1, code: 1 }, { unique: true });

export default mongoose.models.Division || mongoose.model<IDivision>('Division', DivisionSchema);
