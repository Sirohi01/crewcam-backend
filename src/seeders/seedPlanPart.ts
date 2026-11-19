import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { seedPackages } from './seedPackages';
import { seedPlanAddOns } from './seedPlanAddOns';
import { seedPlanFeatures } from './seedPlanFeatures';

// Runs one part of the Excel-driven pricing seeds: `ts-node src/seeders/seedPlanPart.ts <plans|addons|features>`.
const parts: Record<string, () => Promise<void>> = {
    plans: seedPackages,
    addons: seedPlanAddOns,
    features: seedPlanFeatures,
};

const run = async () => {
    const part = process.argv[2];
    const seed = parts[part];
    if (!seed) {
        console.error(`Unknown seed "${part}". Use one of: ${Object.keys(parts).join(', ')}`);
        process.exit(1);
    }
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crewcam');
        await seed();
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error(`Seeding ${part} failed:`, error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

run();
