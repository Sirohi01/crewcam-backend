import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Tenant } from '../src/models/Tenant';
import { WhiteLabel } from '../src/models/WhiteLabel';
import { normalizeSubdomain } from '../src/utils/subdomain';

dotenv.config();

/** One-time backfill for tenants created before companyWizardController.ts started
 * copying the wizard's "Custom Subdomain" step onto Tenant.subdomain. Until now it
 * only ever landed on WhiteLabel.customSubdomain — a field nothing actually queries —
 * while every subdomain-based public lookup (careerPortalRoutes.ts, login branding,
 * employer-login's subdomain check) reads Tenant.subdomain. Net effect: those tenants'
 * public careers pages 404 on every request, regardless of jobs/publish channels.
 *
 * Usage: npx ts-node scripts/backfillTenantSubdomains.ts
 */
async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);

  const whitelabels = await WhiteLabel.find({ customSubdomain: { $exists: true, $nin: [null, ''] } })
    .select('tenantId customSubdomain')
    .lean();

  let updated = 0, skippedNoChange = 0, skippedConflict = 0;

  for (const wl of whitelabels) {
    const subdomain = normalizeSubdomain(wl.customSubdomain);
    if (!subdomain) continue;

    const tenant = await Tenant.findById(wl.tenantId).select('subdomain name');
    if (!tenant) continue;
    if (tenant.subdomain) { skippedNoChange++; continue; }

    const conflict = await Tenant.findOne({ subdomain, _id: { $ne: tenant._id } }).select('_id').lean();
    if (conflict) {
      console.warn(`[${tenant.name}] skipped — "${subdomain}" is already used by another tenant`);
      skippedConflict++;
      continue;
    }

    tenant.subdomain = subdomain;
    await tenant.save();
    console.log(`[${tenant.name}] subdomain set to "${subdomain}"`);
    updated++;
  }

  console.log(`Done. Updated ${updated}, already set ${skippedNoChange}, conflicts skipped ${skippedConflict}.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
