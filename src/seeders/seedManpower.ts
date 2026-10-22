import { Tenant } from '../models/Tenant';
import { ManpowerRequest } from '../models/ManpowerRequest';

export const seedManpower = async () => {
  const tenant = await Tenant.findOne();
  if (!tenant) {
    console.log('No tenant found. Run main seed first.');
    return;
  }

  const existingCount = await ManpowerRequest.countDocuments({ tenantId: tenant._id });
  if (existingCount > 0) {
    console.log(`Found ${existingCount} existing manpower requests. Skipping seed.`);
    return;
  }

  console.log('Seeding manpower requests...');
  
  await ManpowerRequest.create([
    {
      tenantId: tenant._id,
      jobTitle: 'Sales Manager',
      employmentType: 'Full-time',
      numberOfPositions: 2,
      priority: 'High',
      status: 'Approved',
      reasonForHiring: 'Expansion',
      requestDate: new Date('2026-06-15')
    },
    {
      tenantId: tenant._id,
      jobTitle: 'HR Executive',
      employmentType: 'Full-time',
      numberOfPositions: 1,
      priority: 'Medium',
      status: 'Pending',
      reasonForHiring: 'Replacement',
      requestDate: new Date('2026-06-14')
    },
    {
      tenantId: tenant._id,
      jobTitle: 'Software Developer',
      employmentType: 'Contract',
      numberOfPositions: 3,
      priority: 'High',
      status: 'Pending',
      reasonForHiring: 'New Project',
      requestDate: new Date('2026-06-10')
    }
  ]);

  console.log('Seeded manpower requests.');
};
