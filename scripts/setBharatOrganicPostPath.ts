import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Integration } from '../src/models/Integration';
import { Company } from '../src/models/Company';

dotenv.config();

/**
 * One-off: now that organic_backend has a real POST /api/careers/integrations/jobs
 * endpoint (API-key gated), fill in postPath + apiKey on Bharat Organic's existing
 * "career-site" integration so postJobToCareerSite() can actually push jobs out to
 * bharatorganicexpo.com instead of skipping (no postPath configured).
 *
 * Usage: npx ts-node scripts/setBharatOrganicPostPath.ts
 */
const POST_PATH = '/api/careers/integrations/jobs';
const API_KEY = 'b96d5c5da302c1d3bbc9cc0b9a91ff4ec7994d3c97bf914c962ceb9e205cc60c';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);

  const company = await Company.findOne({ website: { $regex: /bharatorganicexpo\.com/i } })
    .select('tenantId tradeName legalName website')
    .setOptions({ bypassTenantIsolation: true })
    .lean();

  if (!company) {
    console.error('No company found with website matching bharatorganicexpo.com');
    process.exit(1);
  }
  const tenantId = String((company as any).tenantId);
  console.log('Tenant:', tenantId, (company as any).tradeName || (company as any).legalName, (company as any).website);

  const integration = await Integration.findOne({ tenantId, provider: 'career-site' } as any);
  if (!integration) {
    console.error('No career-site integration found for this tenant — run setupCareerSiteIntegration.ts first');
    process.exit(1);
  }

  const existing = integration.getDecryptedCredentials();
  console.log('Before:', { ...existing, apiKey: existing.apiKey ? '[already set]' : undefined });

  integration.credentials = { ...existing, postPath: POST_PATH, apiKey: API_KEY } as any;
  integration.isActive = true;
  await integration.save();

  const after = integration.getDecryptedCredentials();
  console.log('After:', { ...after, apiKey: after.apiKey ? `[set, len=${after.apiKey.length}]` : undefined });

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
