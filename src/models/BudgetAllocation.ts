import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IBudgetHead {
    head: string;
    description?: string;
    annual: number;
    q1: number;
    q2: number;
    q3: number;
    q4: number;
}

export interface IBudgetAllocation extends Document {
    departmentId: Types.ObjectId;
    financialYear: string;
    budgetType: string;
    currency: string;
    allocationDate: Date;
    budgetOwnerId?: Types.ObjectId;
    preparedById?: Types.ObjectId;
    notes?: string;
    budgetHeads: IBudgetHead[];
    status: 'Draft' | 'Approved' | 'Rejected';
    createdBy?: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const BudgetHeadSchema = new Schema<IBudgetHead>(
    {
        head: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        annual: { type: Number, required: true, default: 0 },
        q1: { type: Number, required: true, default: 0 },
        q2: { type: Number, required: true, default: 0 },
        q3: { type: Number, required: true, default: 0 },
        q4: { type: Number, required: true, default: 0 },
    },
    { _id: true }
);

const BudgetAllocationSchema = new Schema<IBudgetAllocation>(
    {
        departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
        financialYear: { type: String, required: true, trim: true },
        budgetType: { type: String, required: true, default: 'Department Budget' },
        currency: { type: String, required: true, default: 'INR - Indian Rupee (₹)' },
        allocationDate: { type: Date, required: true, default: Date.now },
        budgetOwnerId: { type: Schema.Types.ObjectId, ref: 'Employee' },
        preparedById: { type: Schema.Types.ObjectId, ref: 'Employee' },
        notes: { type: String, trim: true },
        budgetHeads: { type: [BudgetHeadSchema], default: [] },
        status: { type: String, enum: ['Draft', 'Approved', 'Rejected'], default: 'Draft' },
        createdBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    },
    { timestamps: true }
);

// One allocation per department per financial year
BudgetAllocationSchema.index({ departmentId: 1, financialYear: 1 }, { unique: true });

export default mongoose.model<IBudgetAllocation>('BudgetAllocation', BudgetAllocationSchema);