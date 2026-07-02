import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { Tenant } from '../models/Tenant';
import { Company } from '../models/Company';
import { User } from '../models/User';
import { Package } from '../models/Package';
import { Role } from '../models/Role';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/CREWCAM';

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // 1. Create a Package (Optional but good to have)
    let defaultPackage = await Package.findOne({ name: 'Enterprise' });
    if (!defaultPackage) {
      defaultPackage = await Package.create({
        name: 'Enterprise',
        description: 'All features included',
        priceINR: 9999,
        priceUSD: 120,
        maxCompanies: 10,
        maxBranches: 10,
        maxDepartments: 50,
        maxDesignations: 100,
        maxUsers: 1000,
        features: ['all'],
        isActive: true,
      });
      console.log('Created Default Package');
    }

    // 2. Create a Tenant
    let tenant = await Tenant.findOne({ name: 'Acme Corp' });
    if (!tenant) {
      tenant = await Tenant.create({
        name: 'Acme Corp',
        isActive: true,
        packageId: defaultPackage._id,
        aiCredits: 1000,
      });
      console.log('Created Default Tenant');
    }

    const tenantIdString = String(tenant._id);

    // 3. Create a Company for the Tenant
    let company = await Company.findOne({ email: 'info@acmecorp.com', tenantId: tenantIdString });
    if (!company) {
      company = await Company.create({
        tenantId: tenantIdString,
        legalName: 'Acme Corporation',
        tradeName: 'Acme Corp',
        email: 'info@acmecorp.com',
        phone: '1234567890',
        isActive: true,
      });
      console.log('Created Default Company');
    }

    // 4. Create a Role (Admin)
    let adminRole = await Role.findOne({ name: 'Admin', tenantId: tenantIdString });
    if (!adminRole) {
      adminRole = await Role.create({
        tenantId: tenantIdString,
        name: 'Admin',
        description: 'System Administrator',
        permissions: ['*'],
        category: 'company_admin',
      });
      console.log('Created Admin Role');
    }

    // 5. Create a User (Admin User)
    const adminEmail = 'admin@acmecorp.com';
    let adminUser = await User.findOne({ email: adminEmail, tenantId: tenantIdString });
    if (!adminUser) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('Admin@123', salt);

      adminUser = await User.create({
        tenantId: tenantIdString,
        email: adminEmail,
        passwordHash,
        firstName: 'System',
        lastName: 'Admin',
        roleId: adminRole._id,
        employmentStatus: 'active',
        isActive: true,
        twoFactorEnabled: false,
        failedLoginAttempts: 0,
      });
      console.log(`Created Admin User: ${adminEmail} (Password: Admin@123)`);
    } else {
      console.log('Admin User already exists.');
    }

    console.log('Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
}

seed();
