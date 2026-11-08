import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { PlatformModule } from '../src/models/dropdowns/Module';
import { PAYMENT_OBLIGATIONS_FEATURE } from '../src/utils/featureKeys';

dotenv.config();

/** Registers the optional "Payment Obligations" add-on in the platform module catalogue
 * (Super Admin → Settings → Modules Management), so it can be switched on per package
 * in the plan builder. Its code matches PAYMENT_OBLIGATIONS_FEATURE, which is what
 * requireFeature() and the sidebar check.
 *
 * Idempotent: inserts only when missing ($setOnInsert), so re-running never overwrites
 * name/description/visibility edits made later in super admin.
 *
 * Usage: npx ts-node scripts/seedPaymentObligationsModule.ts
 */
async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);

  const result = await PlatformModule.updateOne(
    { code: PAYMENT_OBLIGATIONS_FEATURE },
    {
      $setOnInsert: {
        name: 'Payment Obligations',
        code: PAYMENT_OBLIGATIONS_FEATURE,
        category: 'Finance',
        description:
          'Track recurring company payments and statutory dues: monthly bills, rent, loan EMIs, yearly renewals, insurance, vehicle compliance and tax obligations (GST, TDS, TCS, PF, ESIC), with due-date reminders.',
        isActive: true,
        visibleInPackages: true,
        isDefaultModule: false, // optional add-on, not part of the base plan
      },
    },
    { upsert: true },
  );

  console.log(result.upsertedCount ? 'Payment Obligations module created' : 'Payment Obligations module already exists (unchanged)');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
