import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { seedPackages } from './seedPackages';
import { seedPlanAddOns } from './seedPlanAddOns';
import { seedPlanFeatures } from './seedPlanFeatures';

// Runs only the Excel-driven pricing seeds (plans, add-ons, priced features) without touching users / companies.
const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crewcam');
        await seedPackages();
        await seedPlanAddOns();
        await seedPlanFeatures();
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Plan pricing seeding failed:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

run();
