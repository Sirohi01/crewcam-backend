import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Role } from '../src/models/Role';

dotenv.config();

/** One-time: give existing "Admin" roles the two permissions introduced in Phase 1D
 * (NOTIFICATION_SEND for WhatsApp messages, KPI_WRITE for Department KPIs). New Admin
 * roles get them from the role preset. "Company Admin" already has '*', so it is skipped.
 * Other roles can be granted these in Settings → Role Rights.
 *
 * Idempotent ($addToSet, never removes). Dry run by default; pass --apply to write.
 * Usage: npx ts-node scripts/grantAdminMessagingKpiPermissions.ts [--apply]
 */
const PERMISSIONS = ['NOTIFICATION_SEND', 'KPI_WRITE'];

async function main() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI as string);

  const filter = { name: 'Admin', permissions: { $nin: ['*'] } };
  const roles = await Role.find(filter).setOptions({ bypassTenantIsolation: true }).select('_id tenantId permissions').lean();
  const needing = roles.filter((r: any) => PERMISSIONS.some((p) => !(r.permissions || []).includes(p)));
  console.log(`${needing.length} Admin role(s) missing ${PERMISSIONS.join(' / ')}${apply ? '' : ' (dry run)'}`);

  if (apply && needing.length) {
    const res = await Role.updateMany(
      { _id: { $in: needing.map((r: any) => r._id) } },
      { $addToSet: { permissions: { $each: PERMISSIONS } } },
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
