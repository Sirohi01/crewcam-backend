import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { seedPackages } from './seedPackages';
import { seedUsersAndCompanies } from './seedUsersAndCompanies';
import { seedShiftTimings } from './seedShiftTimings';
import { seedManpower } from './seedManpower';
import { seedSuperAdmin } from './seedSuperAdmin';
// Note: We are excluding seedLMS and seedHiringDemoData from the default run as they are for demo/testing purposes.
// They can be run manually or triggered via a flag if needed in the future.

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/crewcam';

const runAllSeeds = async () => {
    try {
        console.log('Connecting to MongoDB...', MONGO_URI);
        await mongoose.connect(MONGO_URI);
        console.log('Connected to Database successfully.');

        console.log('\n--- Seeding Packages ---');
        await seedPackages();
        
        console.log('\n--- Seeding Super Admin ---');
        await seedSuperAdmin();

        console.log('\n--- Seeding Users and Companies ---');
        await seedUsersAndCompanies();

        console.log('\n--- Seeding Shift Timings ---');
        await seedShiftTimings();

        console.log('\n--- Seeding Manpower ---');
        await seedManpower();

        console.log('\n=======================================');
        console.log('ALL SEEDING COMPLETED SUCCESSFULLY!');
        console.log('=======================================');
        
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('\nMaster Seeding failed:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

runAllSeeds();
