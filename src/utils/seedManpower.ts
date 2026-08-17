import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Tenant } from '../models/Tenant';
import { ManpowerRequest } from '../models/ManpowerRequest';

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected to MongoDB');

  const tenant = await Tenant.findOne();
  if (!tenant) {
    console.log('No tenant found. Run main seed first.');
    process.exit(1);
  }

  const existingCount = await ManpowerRequest.countDocuments({ tenantId: tenant._id });
  if (existingCount > 0) {
    console.log(`Found ${existingCount} existing manpower requests. Skipping seed.`);
    process.exit(0);
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
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
