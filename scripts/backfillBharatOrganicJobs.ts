import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ManpowerRequest } from '../src/models/ManpowerRequest';
import { mapRemoteJobToManpowerRequest, RemoteJob } from '../src/services/careerSiteSync.service';

dotenv.config();

/**
 * One-time backfill: the local Bharat Organic backend (organic_backend) can't be
 * booted right now (its tsx/esbuild toolchain segfaults on this machine, unrelated
 * to this sync feature), so this reads the same OPEN jobs its public
 * GET /api/careers/jobs endpoint would have returned directly from its database,
 * and runs them through the exact same mapRemoteJobToManpowerRequest() the real
 * HTTP-based syncCareerSiteJobs() uses. Once the server issue is fixed, re-running
 * the real sync (POST /manpower-request/sync-career-site) will upsert these same
 * rows (matched by externalJobId) — nothing here is a one-off hack to the schema.
 */
const TENANT_ID = '6aad1d313af647fb250a8066'; // Namogange Wellness Pvt Ltd
const ORGANIC_URI = process.env.ORGANIC_MONGODB_URI ||
  'mongodb://organic:organic@ac-purk3nf-shard-00-00.ewln5jk.mongodb.net:27017,ac-purk3nf-shard-00-01.ewln5jk.mongodb.net:27017,ac-purk3nf-shard-00-02.ewln5jk.mongodb.net:27017/organic_db?ssl=true&replicaSet=atlas-oumrp6-shard-0&authSource=admin&appName=Cluster0';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const organicConn = await mongoose.createConnection(ORGANIC_URI).asPromise();

  // Read-only: same filter as organic_backend's public getJobs controller (status: OPEN).
  const jobs = await organicConn.collection('jobs').find({ status: 'OPEN' }).toArray();

  let created = 0, updated = 0;
  for (const job of jobs as unknown as RemoteJob[]) {
    const result = await ManpowerRequest.findOneAndUpdate(
      { tenantId: TENANT_ID, externalJobId: String(job._id) } as any,
      { $set: mapRemoteJobToManpowerRequest(TENANT_ID, job) },
      { upsert: true, new: false, setDefaultsOnInsert: true } as any
    );
    if (result) updated++; else created++;
  }

  console.log(`Backfilled ${jobs.length} job(s) for tenant ${TENANT_ID}: ${created} created, ${updated} updated.`);

  await organicConn.close();
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
