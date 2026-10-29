import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Company } from '../src/models/Company';
import { User } from '../src/models/User';
import { Department } from '../src/models/Department';
import { ManpowerRequest } from '../src/models/ManpowerRequest';
import { publishManpowerRequestToChannels } from '../src/controllers/hiringRequisitionController';

dotenv.config();

/**
 * End-to-end test: exercises the exact controller function the "Post to Selected
 * Channels" button calls (publishManpowerRequestToChannels), twice in a row, against
 * Bharat Organic's tenant with "Website" ticked — to confirm (a) the push to
 * organic_backend's new /api/careers/integrations/jobs endpoint actually succeeds, and
 * (b) publishing the same request a second time UPDATES the same remote job instead of
 * creating a duplicate (matched on hrCrmJobId server-side).
 *
 * Usage: npx ts-node scripts/testBharatOrganicPublish.ts
 */
function fakeRes() {
  const res: any = {
    _status: 200,
    _body: undefined,
    status(code: number) { this._status = code; return this; },
    json(body: any) { this._body = body; return this; },
  };
  return res;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);

  const company = await Company.findOne({ website: { $regex: /bharatorganicexpo\.com/i } })
    .select('tenantId tradeName legalName')
    .setOptions({ bypassTenantIsolation: true })
    .lean();
  if (!company) throw new Error('Bharat Organic company not found');
  const tenantId = String((company as any).tenantId);
  console.log('Tenant:', tenantId, (company as any).tradeName || (company as any).legalName);

  const anyUser = await User.findOne({ tenantId } as any).select('_id name').lean();
  if (!anyUser) throw new Error('No user found for this tenant to act as publisher');
  console.log('Acting as user:', (anyUser as any)._id, (anyUser as any).name);

  const anyDepartment = await Department.findOne({ tenantId } as any).select('_id name').lean();
  if (!anyDepartment) throw new Error('No department found for this tenant to attach to the test job');
  console.log('Using department:', (anyDepartment as any)._id, (anyDepartment as any).name);

  // Reuse the same test request across runs (matched by jobCode) so this script is safe to re-run.
  const JOB_CODE = 'JOB-TEST-PUBLISH-001';
  let request = await ManpowerRequest.findOne({ tenantId, jobCode: JOB_CODE } as any);
  if (!request) {
    request = await ManpowerRequest.create({
      tenantId,
      jobTitle: 'Publish Flow Test Job - Please Delete',
      designation: 'Publish Flow Test Job - Please Delete',
      departmentId: (anyDepartment as any)._id,
      workLocation: 'Remote',
      employmentType: 'Permanent',
      workMode: 'Remote',
      numberOfPositions: 1,
      experienceReq: '1-2 Years',
      qualificationReq: 'Graduate',
      salaryCtcMin: 30000,
      salaryCtcMax: 40000,
      jobDescriptionSummary: 'Script-created test job to verify the HR-CRM -> organic_backend publish flow end to end.',
      technicalSkills: ['Testing'],
      keyResponsibilities: ['Verify publish flow'],
      whoCanApply: 'Internal Only',
      jobCode: JOB_CODE,
      priority: 'Medium',
      reasonForHiring: 'New Position',
      recruitmentStatus: 'Draft',
      status: 'Pending',
      requestedBy: (anyUser as any)._id,
    } as any);
    console.log('Created test ManpowerRequest:', request._id.toString());
  } else {
    request.departmentId = (anyDepartment as any)._id;
    await request.save();
    console.log('Reusing existing test ManpowerRequest:', request._id.toString());
  }

  const runPublish = async (label: string) => {
    const req: any = {
      tenantId,
      user: { _id: (anyUser as any)._id },
      params: { id: String(request!._id) },
      body: { publishChannels: ['Website'] },
      headers: { 'user-agent': 'test-script' },
      ip: '127.0.0.1',
    };
    const res = fakeRes();
    await publishManpowerRequestToChannels(req, res);
    console.log(`\n--- ${label} ---`);
    console.log('HTTP status:', res._status);
    console.log('publishResults:', JSON.stringify(res._body?.publishResults, null, 2));
  };

  await runPublish('First publish (should create remote job)');
  await runPublish('Second publish, same request (should UPDATE, not duplicate)');

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
