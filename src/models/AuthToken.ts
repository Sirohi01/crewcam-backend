import mongoose, { Schema, Document } from 'mongoose';

export type AuthTokenType = 'refresh' | 'password_reset';

export interface IAuthToken extends Document {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  type: AuthTokenType;
  expiresAt: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AuthTokenSchema = new Schema<IAuthToken>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  type: { type: String, enum: ['refresh', 'password_reset'], required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  revokedAt: { type: Date },
}, { timestamps: true });

export const AuthToken = mongoose.model<IAuthToken>('AuthToken', AuthTokenSchema);
