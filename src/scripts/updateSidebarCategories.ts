import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/namoCrewcam';

const employeePaths = [
  '/company',
  '/company/employees',
  '/company/employees/dashboard',
  '/company/employees/my-profile',
  '/company/attendance',
  '/company/employee-leave',
  '/company/my-performance',
  '/company/goals-and-okrs',
  '/company/payslip-and-income-tax',
  '/company/reimbursement',
  '/company/my-requests',
  '/company/my-tasks',
  '/company/training-development',
  '/company/policies',
  '/company/company-directory',
  '/company/announcements',
  '/company/helpdesk',
  '/company/settings'
];

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to DB:', MONGODB_URI);

    const items = await mongoose.connection.collection('sidebarconfigs').find({}).toArray();
    console.log(`Found ${items.length} sidebar items in total.`);

    let updatedCount = 0;
    for (const item of items) {
      const href = item.href as string;
      const categories = item.categories as string[] || [];
      
      const isEmployeePage = employeePaths.some(p => {
        if (p === '/company') return href === '/company';
        return href === p || href.startsWith(p + '/');
      });
      
      const hasEmployeeRole = categories.includes('employee');
      
      let needsUpdate = false;
      let newCategories = [...categories];

      if (isEmployeePage && !hasEmployeeRole) {
        newCategories.push('employee');
        needsUpdate = true;
      } else if (!isEmployeePage && hasEmployeeRole) {
        newCategories = newCategories.filter(c => c !== 'employee');
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await mongoose.connection.collection('sidebarconfigs').updateOne(
          { _id: item._id },
          { $set: { categories: newCategories } }
        );
        console.log(`Updated roles for ${href}: added/removed 'employee' (${categories} -> ${newCategories})`);
        updatedCount++;
      }
    }

    console.log(`Done! Updated ${updatedCount} items.`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from DB.');
  }
}

run();
