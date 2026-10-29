import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ManpowerRequest } from '../src/models/ManpowerRequest';

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const result = await ManpowerRequest.deleteOne({ jobCode: 'JOB-TEST-PUBLISH-001' } as any, { bypassTenantIsolation: true } as any);
  console.log('Deleted test ManpowerRequest count:', result.deletedCount);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
