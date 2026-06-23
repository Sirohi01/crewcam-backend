import mongoose from 'mongoose';
import { ShiftTiming } from '../models/ShiftTiming';
import { Tenant } from '../models/Tenant';
import dotenv from 'dotenv';
dotenv.config();

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/CREWCAM');

  const tenants = await Tenant.find({});
  if (tenants.length === 0) {
    console.log('No tenant found to seed shift timings for.');
    process.exit(1);
  }

  for (const tenant of tenants) {
    const shifts = [
      {
        name: 'Day Shift',
        code: 'DAY',
        description: 'Standard day shift from 9 AM to 6 PM',
        checkInTime: '09:00',
        checkOutTime: '18:00',
        gracePeriodLC: 15,
        gracePeriodEG: 15,
        halfDayThresholdMHD: 4,
        absentThreshold: '12:00',
        isSandwichRuleApplicable: false,
        weekOffDays: ['Sunday'],
        workOnWeekOffMultiplier: 2.0,
        workOnHolidayMultiplier: 2.0,
        isActive: true,
        tenantId: tenant._id,
      },
      {
        name: 'Night Shift',
        code: 'NIGHT',
        description: 'Standard night shift from 8 PM to 5 AM',
        checkInTime: '20:00',
        checkOutTime: '05:00',
        gracePeriodLC: 15,
        gracePeriodEG: 15,
        halfDayThresholdMHD: 4,
        absentThreshold: '23:00',
        isSandwichRuleApplicable: false,
        weekOffDays: ['Sunday'],
        workOnWeekOffMultiplier: 2.0,
        workOnHolidayMultiplier: 2.0,
        isActive: true,
        tenantId: tenant._id,
      }
    ];

    for (const shift of shifts) {
      const existing = await ShiftTiming.findOne({ name: shift.name, tenantId: tenant._id } as any);
      if (!existing) {
        await ShiftTiming.create(shift);
        console.log(`Seeded ${shift.name} for tenant ${tenant.name}`);
      } else {
        console.log(`${shift.name} already exists for tenant ${tenant.name}`);
      }
    }
  }

  console.log('Done.');
  process.exit(0);
};

run().catch(console.error);
