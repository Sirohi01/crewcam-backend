import mongoose, { Schema, Document } from 'mongoose';

export interface IGoal {
  name: string;
  targetValue: number;
  minThreshold: number;
  maxThreshold: number;
  weightage: number;
}

export interface IDepartmentKpi extends Document {
  companyId: mongoose.Types.ObjectId;
  departmentId: mongoose.Types.ObjectId;
  title: string;
  code: string;
  kpiType: string;
  category: string;
  perspective: string;
  weightage: number;
  description: string;
  measurementUnit: string;
  targetType: string;
  targetIsHigherBetter: boolean;
  goalPeriod: string;
  goals: IGoal[];
  alignedWith: string;
  alignmentDetails: string;
  assignedTo: string;
  alignmentDepartment: string;
  cascadedKpi: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const goalSchema = new Schema<IGoal>({
  name: { type: String, required: true },
  targetValue: { type: Number, required: true },
  minThreshold: { type: Number, required: true },
  maxThreshold: { type: Number, required: true },
  weightage: { type: Number, required: true },
});

const departmentKpiSchema = new Schema<IDepartmentKpi>({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
  title: { type: String, required: true },
  code: { type: String, required: true },
  kpiType: { type: String, required: true },
  category: { type: String, required: true },
  perspective: { type: String, required: true },
  weightage: { type: Number, required: true },
  description: { type: String },
  measurementUnit: { type: String, required: true },
  targetType: { type: String, required: true },
  targetIsHigherBetter: { type: Boolean, default: true },
  goalPeriod: { type: String, required: true },
  goals: [goalSchema],
  alignedWith: { type: String },
  alignmentDetails: { type: String },
  assignedTo: { type: String },
  alignmentDepartment: { type: String },
  cascadedKpi: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const DepartmentKpi = mongoose.model<IDepartmentKpi>('DepartmentKpi', departmentKpiSchema);
