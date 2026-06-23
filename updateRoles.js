require('dotenv').config();
const mongoose = require('mongoose');
const { Role } = require('./src/models/Role');

const tenantId = '6a31399a1c1b47795025af22';

const seedRoles = [
  {
    name: 'Company Admin',
    description: 'Full administrative access to all modules and configurations.',
    category: 'company_admin',
    permissions: ['*']
  },
  {
    name: 'HR Manager',
    description: 'Can manage employees, view organizational structure, and configure HR rules.',
    category: 'hr_admin',
    permissions: ['EMPLOYEE_READ', 'EMPLOYEE_WRITE', 'ORG_READ', 'ORG_WRITE', 'MASTER_READ', 'MASTER_WRITE']
  },
  {
    name: 'Finance Manager',
    description: 'Can process payroll and view financial records.',
    category: 'finance',
    permissions: ['EMPLOYEE_READ', 'PAYROLL_READ', 'PAYROLL_WRITE']
  },
  {
    name: 'Department HOD',
    description: 'Head of Department access for reviewing requests.',
    category: 'hod',
    permissions: ['EMPLOYEE_READ', 'LEAVE_APPROVE']
  },
  {
    name: 'Employee',
    description: 'Basic access for logging attendance, applying leaves, and viewing profile.',
    category: 'employee',
    permissions: ['EMPLOYEE_READ']
  }
];

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/CREWCAM').then(async () => {
  console.log('Seeding Roles...');
  for (let r of seedRoles) {
    await Role.findOneAndUpdate(
      { name: r.name, tenantId },
      { ...r, tenantId, isActive: true },
      { upsert: true }
    );
  }
  console.log('Roles Seeded Successfully!');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
