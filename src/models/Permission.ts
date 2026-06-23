import mongoose, { Schema, Document } from 'mongoose';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IPermission extends Document, IAuditable {
  name: string;
  module: string;
  description: string;
}

const PermissionSchema = new Schema<IPermission>({
  name: { type: String, required: true, unique: true },
  module: { type: String, required: true },
  description: { type: String },
}, { timestamps: true });

PermissionSchema.plugin(auditPlugin);

export const Permission = mongoose.model<IPermission>('Permission', PermissionSchema);
