import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Import all dropdown models
import { AdvancePayment } from '../models/dropdowns/AdvancePayment';
import { BillingCycle } from '../models/dropdowns/BillingCycle';
import { CompanySize } from '../models/dropdowns/CompanySize';
import { Currency } from '../models/dropdowns/Currency';
import { DateFormat } from '../models/dropdowns/DateFormat';
import { FinancialYear } from '../models/dropdowns/FinancialYear';
import { FirstDayOfMonth } from '../models/dropdowns/FirstDayOfMonth';
import { GSTTreatment } from '../models/dropdowns/GSTTreatment';
import { Industry } from '../models/dropdowns/Industry';
import { LeaveYearStartMonth } from '../models/dropdowns/LeaveYearStartMonth';
import { NumberFormat } from '../models/dropdowns/NumberFormat';
import { PreferredLanguage } from '../models/dropdowns/PreferredLanguage';
import { TimeFormat } from '../models/dropdowns/TimeFormat';
import { TimeZone } from '../models/dropdowns/TimeZone';
import { WeekStartsOn } from '../models/dropdowns/WeekStartsOn';

dotenv.config();

const SEED_DATA = {
  AdvancePayment: ['Not allowed', 'Allowed with limit', 'No limit'],
  BillingCycle: ['Monthly', 'Quarterly', 'Semi-Annually', 'Annually'],
  CompanySize: ['1 - 50 Employees', '51 - 200 Employees', '201 - 500 Employees', '500+ Employees'],
  Currency: ['INR (₹) - Indian Rupee', 'USD ($) - US Dollar', 'EUR (€) - Euro', 'GBP (£) - British Pound', 'AED (د.إ) - UAE Dirham'],
  DateFormat: ['DD MMM YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
  FinancialYear: ['April - March', 'January - December', 'July - June', 'October - September'],
  FirstDayOfMonth: ['1st', '10th', '15th', 'Last day of month'],
  GSTTreatment: ['Registered', 'Unregistered', 'Composition Scheme', 'Overseas'],
  Industry: ['Information Technology', 'Manufacturing', 'Retail', 'Healthcare', 'Finance & Banking', 'Education'],
  LeaveYearStartMonth: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  NumberFormat: ['1,23,456.78', '123,456.78', '123 456,78', '123 456.78', '123,456,789.00'],
  PreferredLanguage: ['English (US)', 'English (UK)', 'Spanish', 'French', 'Hindi'],
  TimeFormat: ['12 Hours', '24 Hours'],
  TimeZone: ['(GMT+05:30) Asia/Kolkata', '(GMT+00:00) UTC', '(GMT-05:00) America/New_York', '(GMT+01:00) Europe/London', '(GMT+04:00) Asia/Dubai'],
  WeekStartsOn: ['Monday', 'Sunday', 'Saturday']
};

const MODELS: any = {
  AdvancePayment,
  BillingCycle,
  CompanySize,
  Currency,
  DateFormat,
  FinancialYear,
  FirstDayOfMonth,
  GSTTreatment,
  Industry,
  LeaveYearStartMonth,
  NumberFormat,
  PreferredLanguage,
  TimeFormat,
  TimeZone,
  WeekStartsOn
};

async function seedDropdowns() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/crewcam';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB for seeding');

    for (const [modelName, dataList] of Object.entries(SEED_DATA)) {
      const Model = MODELS[modelName];
      if (!Model) continue;

      let added = 0;
      for (const itemName of dataList) {
        // Upsert to ensure no duplicates based on name
        const result = await Model.updateOne(
          { name: itemName },
          { $setOnInsert: { name: itemName, isActive: true } },
          { upsert: true }
        );
        if (result.upsertedCount > 0) {
          added++;
        }
      }
      console.log(`Seeded ${added} new items for ${modelName}`);
    }

    console.log('Dropdown seeding completed successfully.');
  } catch (error) {
    console.error('Error seeding dropdowns:', error);
  } finally {
    await mongoose.disconnect();
  }
}

seedDropdowns();
