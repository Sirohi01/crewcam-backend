import mongoose from 'mongoose';
import dotenv from 'dotenv';
import TeamMember from '../src/models/TeamMember';
import { Department } from '../src/models/Department';
import { SubDepartment } from '../src/models/SubDepartment';

dotenv.config();

/** One-time backfill for TeamMember records created before teamMemberController.ts
 * started stamping tenantId. Those records were scoped only by the sub-department
 * *name*, so once queries require tenantId (Phase 0 hardening) they stop appearing.
 *
 * A record's tenant is inferred, in order of confidence, from:
 *   1. its departmentId -> Department.tenantId
 *   2. its subDepartment name -> the single tenant owning a SubDepartment with that
 *      name or code (case-insensitive). If several tenants match, it is ambiguous and
 *      is reported, never guessed.
 *
 * Dry run by default; pass --apply to write.
 * Usage: npx ts-node scripts/backfillTeamMemberTenant.ts [--apply]
 */
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function main() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI as string);

  const orphans = await TeamMember.find({ tenantId: { $exists: false } })
    .setOptions({ bypassTenantIsolation: true })
    .select('_id employeeId email departmentId subDepartment')
    .lean();

  console.log(`${orphans.length} team member(s) without tenantId${apply ? '' : ' (dry run)'}`);

  let resolved = 0;
  const unresolved: string[] = [];

  for (const member of orphans) {
    let tenantId: string | undefined;

    if (member.departmentId) {
      const dept = await Department.findOne({ _id: member.departmentId })
        .setOptions({ bypassTenantIsolation: true })
        .select('tenantId')
        .lean();
      tenantId = dept?.tenantId ? String(dept.tenantId) : undefined;
    }

    if (!tenantId && member.subDepartment) {
      const name = new RegExp(`^${escapeRegex(String(member.subDepartment).replace(/-/g, ' '))}$`, 'i');
      const raw = new RegExp(`^${escapeRegex(String(member.subDepartment))}$`, 'i');
      const tenants: string[] = await SubDepartment.distinct('tenantId', {
        $or: [{ name }, { name: raw }, { code: raw }],
      });
      if (tenants.length === 1) tenantId = String(tenants[0]);
    }

    if (!tenantId) {
      unresolved.push(`${member._id} (employeeId=${member.employeeId}, subDepartment=${member.subDepartment ?? '-'})`);
      continue;
    }

    resolved++;
    if (apply) {
      await TeamMember.updateOne(
        { _id: member._id },
        { $set: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
        { bypassTenantIsolation: true } as any
      );
    }
  }

  console.log(`${apply ? 'Updated' : 'Would update'}: ${resolved}`);
  if (unresolved.length) {
    console.log(`Unresolved (assign manually): ${unresolved.length}`);
    unresolved.forEach((line) => console.log(`  - ${line}`));
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
