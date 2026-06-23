import { Schema, Document } from 'mongoose';

export interface IAuditTrail {
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  performedBy: string;
  performedAt: Date;
  changes?: Record<string, any>;
}

export interface IAuditable extends Document {
  createdBy: string;
  updatedBy: string;
  auditTrail: IAuditTrail[];
}

export const auditPlugin = (schema: Schema) => {
  schema.add({
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    auditTrail: [
      {
        action: { type: String, enum: ['CREATE', 'UPDATE', 'DELETE'] },
        performedBy: { type: String },
        performedAt: { type: Date, default: Date.now },
        changes: { type: Schema.Types.Mixed },
      },
    ],
  });

  schema.pre('save', function (this: any) {
    if (this.isNew && (this as any).createdBy) {
      (this as any).auditTrail = [
        ...((this as any).auditTrail || []),
        {
          action: 'CREATE',
          performedBy: (this as any).createdBy,
          performedAt: new Date(),
        },
      ];
    }
  });

  schema.pre('findOneAndUpdate', function (this: any) {
    const update: any = this.getUpdate() || {};
    const set = update.$set || update;
    const performedBy = set.updatedBy || update.updatedBy;
    if (performedBy) {
      this.setUpdate({
        ...update,
        $push: {
          ...(update.$push || {}),
          auditTrail: {
            action: set.isActive === false ? 'DELETE' : 'UPDATE',
            performedBy,
            performedAt: new Date(),
            changes: set,
          },
        },
      });
    }
  });
};
