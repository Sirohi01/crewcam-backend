import mongoose, { Schema, Document } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

export interface ISession extends Document {
  userId: mongoose.Types.ObjectId;
  tenantId: string;
  refreshToken: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  ipAddress?: string;
  lastActive: Date;
  expiresAt: Date;
  isActive: boolean;
}

const SessionSchema = new Schema<ISession>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tenantId: { type: String, required: true, index: true },
  refreshToken: { type: String, required: true, unique: true },
  deviceType: { type: String },
  browser: { type: String },
  os: { type: String },
  ipAddress: { type: String },
  lastActive: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Auto-expire sessions
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

SessionSchema.plugin(tenantPlugin);

export const Session = mongoose.model<ISession>('Session', SessionSchema);
