import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Integration } from '../src/models/Integration';
import { Company } from '../src/models/Company';

dotenv.config();

/**
 * Temporary test switch: points Bharat Organic's "career-site" integration baseUrl at the
 * locally-running organic_backend (http://localhost:5000) instead of the production
 * bharatorganicexpo.com, so the new push endpoint can be tested end-to-end before going live.
 * jobsPath/postPath/apiKey are untouched. Pass "restore" as an arg to switch baseUrl back.
 *
 * Usage:
 *   npx ts-node scripts/pointBharatOrganicAtLocalhost.ts          // switch to localhost
 *   npx ts-node scripts/pointBharatOrganicAtLocalhost.ts restore  // switch back to production
 */
const LOCAL_BASE_URL = 'http://localhost:5000';
const PROD_BASE_URL = 'https://bharatorganicexpo.com';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);

  const company = await Company.findOne({ website: { $regex: /bharatorganicexpo\.com/i } })
    .select('tenantId tradeName legalName')
    .setOptions({ bypassTenantIsolation: true })
    .lean();
  if (!company) {
    console.error('No company found with website matching bharatorganicexpo.com');
    process.exit(1);
  }
  const tenantId = String((company as any).tenantId);

  const integration = await Integration.findOne({ tenantId, provider: 'career-site' } as any);
  if (!integration) {
    console.error('No career-site integration found for this tenant');
    process.exit(1);
  }

  const existing = integration.getDecryptedCredentials();
  const restore = process.argv[2] === 'restore';
  const newBaseUrl = restore ? PROD_BASE_URL : LOCAL_BASE_URL;

  integration.credentials = { ...existing, baseUrl: newBaseUrl } as any;
  await integration.save();

  const after = integration.getDecryptedCredentials();
  console.log(restore ? 'Restored to production:' : 'Switched to localhost:', {
    baseUrl: after.baseUrl,
    jobsPath: after.jobsPath,
    postPath: after.postPath,
    apiKey: after.apiKey ? `[set, len=${after.apiKey.length}]` : undefined,
  });

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
