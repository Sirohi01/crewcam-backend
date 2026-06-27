import mongoose, { Schema, Document } from 'mongoose';
import { auditPlugin, IAuditable } from './plugins/auditPlugin';

export interface IBanner extends Document, IAuditable {
  tag?: string;
  title?: string;
  subtitle?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  imageUrl: string;
  isActive: boolean;
  order: number;
}

const BannerSchema = new Schema<IBanner>({
  tag: { type: String },
  title: { type: String },
  subtitle: { type: String },
  primaryLabel: { type: String },
  primaryHref: { type: String },
  secondaryLabel: { type: String },
  secondaryHref: { type: String },
  imageUrl: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
}, { timestamps: true });

BannerSchema.plugin(auditPlugin);

export const Banner = mongoose.model<IBanner>('Banner', BannerSchema);
