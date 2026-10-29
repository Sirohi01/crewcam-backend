import mongoose, { Schema, Document } from 'mongoose';

/** Records what each test-mode call to /api/v1/test-publish actually received, so a
 * Naukri/LinkedIn "post" can be verified end-to-end (real HTTP call, really stored,
 * really returned) instead of only ever being a console.log in publishService.ts. */
export interface ITestJobPosting extends Document {
  provider: 'naukri' | 'linkedin';
  jobTitle: string;
  jobDescription?: string;
  applyUrl?: string;
  createdAt: Date;
}

const TestJobPostingSchema = new Schema<ITestJobPosting>({
  provider: { type: String, enum: ['naukri', 'linkedin'], required: true, index: true },
  jobTitle: { type: String, required: true },
  jobDescription: { type: String },
  applyUrl: { type: String },
}, { timestamps: { createdAt: true, updatedAt: false } });

export const TestJobPosting = mongoose.model<ITestJobPosting>('TestJobPosting', TestJobPostingSchema);
