import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Role } from '../src/models/Role';

dotenv.config();

/** One-time: give existing "HR Manager" and "Admin" roles EMERGENCY_RESPOND (Phase 1D-3b),
 * so someone in every company receives and can respond to emergency alerts. New companies'
 * HR Manager role gets it from seedSync; "Company Admin" already has '*'. Other roles can
 * be granted it in Settings → Role Rights.
 *
 * Idempotent ($addToSet, never removes). Dry run by default; pass --apply to write.
 * Usage: npx ts-node scripts/grantEmergencyRespondPermission.ts [--apply]
 */
const PERMISSION = 'EMERGENCY_RESPOND';

async function main() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI as string);

  const filter = { name: { $in: ['HR Manager', 'Admin'] }, permissions: { $nin: ['*', PERMISSION] } };
  const roles = await Role.find(filter).setOptions({ bypassTenantIsolation: true }).select('_id tenantId name').lean();
  console.log(`${roles.length} HR Manager/Admin role(s) missing ${PERMISSION}${apply ? '' : ' (dry run)'}`);

  if (apply && roles.length) {
    const res = await Role.updateMany(
      { _id: { $in: roles.map((r: any) => r._id) } },
      { $addToSet: { permissions: PERMISSION } },
      { bypassTenantIsolation: true } as any
    );
    console.log(`Updated ${res.modifiedCount} role(s)`);
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
