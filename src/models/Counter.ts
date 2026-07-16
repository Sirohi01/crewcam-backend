import mongoose, { Schema, Document } from 'mongoose';

// Generic atomic sequence counter, keyed by an arbitrary string (e.g. "CORP-2026" for a
// per-year corporate ID sequence). `findOneAndUpdate` with `$inc` + `upsert` is atomic in
// MongoDB, so concurrent requests for the same key never hand out the same sequence number.
export interface ICounter extends Document {
  key: string;
  seq: number;
}

const CounterSchema = new Schema<ICounter>({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

export const Counter = mongoose.model<ICounter>('Counter', CounterSchema);
