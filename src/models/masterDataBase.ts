import mongoose, { Schema, Document, Model } from 'mongoose';
import { tenantPlugin, ITenantScoped } from './plugins/tenantPlugin';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IMasterDataEntity extends ITenantScoped, IAuditable {
  name: string;
  code?: string;
  description?: string;
  level?: string;
  category?: string;
  effectiveDate?: Date;
  metadata?: Record<string, any>;
  isActive: boolean;
}

export const createMasterDataModel = (modelName: string, collectionName: string): Model<IMasterDataEntity> => {
  const schema = new Schema<IMasterDataEntity>({
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    description: { type: String },
    level: { type: String },
    category: { type: String },
    effectiveDate: { type: Date },
    metadata: { type: Schema.Types.Mixed },
    isActive: { type: Boolean, default: true },
  }, { timestamps: true });

  schema.index({ tenantId: 1, code: 1 }, { unique: true, sparse: true });
  schema.index({ tenantId: 1, name: 1 });
  schema.plugin(tenantPlugin);
  schema.plugin(auditPlugin);

  return mongoose.models[modelName] as Model<IMasterDataEntity> || mongoose.model<IMasterDataEntity>(modelName, schema, collectionName);
};
