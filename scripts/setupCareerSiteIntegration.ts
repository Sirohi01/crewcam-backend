import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Integration } from '../src/models/Integration';
import { Company } from '../src/models/Company';
import { normalizeWebsiteBaseUrl, syncCareerSiteJobs } from '../src/services/careerSiteSync.service';

dotenv.config();

const DEFAULT_JOBS_PATH = '/api/careers/jobs';

/** Backfill for tenants whose Company existed before the "career-site" integration
 * started being set up automatically from the company's Website field (see
 * companyWizardController.ts / superAdminController.ts createTenant/updateTenant).
 * For each one: points its "career-site" integration at its own Company.website,
 * then immediately pulls in whatever jobs are live there (syncCareerSiteJobs) —
 * the same two steps that now happen automatically on company create/edit. Once
 * pulled, those jobs are upserted into ManpowerRequest with publishChannels
 * including "Career Portal" and status "Approved", so they show up right away on
 * that tenant's own public careers page (GET /api/v1/careers/jobs, careerPortalRoutes.ts)
 * without any further action.
 *
 * Usage:
 *   npx ts-node scripts/setupCareerSiteIntegration.ts            // every company with a website
 *   npx ts-node scripts/setupCareerSiteIntegration.ts <tenantId> // just one tenant
 */
async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);

  const onlyTenantId = process.argv[2];
  const companyFilter: any = { website: { $exists: true, $nin: [null, ''] } };
  if (onlyTenantId) companyFilter.tenantId = onlyTenantId;

  const companies = await Company.find(companyFilter)
    .select('tenantId website tradeName legalName')
    .setOptions({ bypassTenantIsolation: true })
    .lean();

  if (companies.length === 0) {
    console.log('No companies with a website found to set up.');
    await mongoose.disconnect();
    return;
  }

  for (const company of companies) {
    const tenantId = String(company.tenantId);
    const label = company.tradeName || company.legalName || tenantId;
    const baseUrl = normalizeWebsiteBaseUrl(company.website || '');
    if (!baseUrl) {
      console.log(`[${label}] skipped — no usable website`);
      continue;
    }

    let integration = await Integration.findOne({ tenantId, provider: 'career-site' } as any);
    if (!integration) {
      integration = new Integration({ tenantId, provider: 'career-site', credentials: {} } as any);
    }
    const existingCreds = integration.getDecryptedCredentials();
    integration.isActive = true;
    // Merge, don't replace — preserves any listPath/fieldMap/postPath/apiKey already
    // configured through the Settings UI for this tenant.
    integration.credentials = { ...existingCreds, baseUrl, jobsPath: existingCreds.jobsPath || DEFAULT_JOBS_PATH };
    await integration.save();

    try {
      const result = await syncCareerSiteJobs(tenantId);
      console.log(`[${label}] ${baseUrl} -> fetched ${result.fetched}, created ${result.created}, updated ${result.updated}, skipped ${result.skipped}`);
    } catch (err: any) {
      console.error(`[${label}] ${baseUrl} -> sync failed: ${err.message}`);
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
