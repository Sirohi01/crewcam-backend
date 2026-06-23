import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { User } from '../src/models/User';
import { Role } from '../src/models/Role';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/CREWCAM';

async function seedSuperAdmin() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    let superAdminRole = await Role.findOne({ name: 'Super Admin', tenantId: 'SUPER_ADMIN' });

    if (!superAdminRole) {
      console.log('Creating Super Admin role...');
      superAdminRole = new Role({
        name: 'Super Admin',
        description: 'Global system administrator',
        permissions: ['*'],
        tenantId: 'SUPER_ADMIN'
      });
      await superAdminRole.save();
    } else {
      console.log('Super Admin role already exists.');
    }

    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@crewcam.app';
    const existingAdmin = await User.findOne({ email: superAdminEmail }).setOptions({ bypassTenantIsolation: true });

    if (!existingAdmin) {
      console.log('Creating Super Admin user...');
      const rawPassword = process.env.SUPER_ADMIN_PASSWORD || `Admin-${crypto.randomBytes(18).toString('base64url')}1A`;
      const passwordHash = await bcrypt.hash(rawPassword, 10);

      const newAdmin = new User({
        email: superAdminEmail,
        passwordHash,
        firstName: 'System',
        lastName: 'Administrator',
        roleId: superAdminRole._id,
        tenantId: 'SUPER_ADMIN',
        isActive: true
      });

      await newAdmin.save();
      console.log('====================================');
      console.log('Super Admin created successfully!');
      console.log(`Email: ${superAdminEmail}`);
      console.log(`Initial one-time password: ${rawPassword}`);
      if (!process.env.SUPER_ADMIN_PASSWORD) {
        console.log('Generated password because SUPER_ADMIN_PASSWORD was not set. Store it securely now; it will not be shown again.');
      }
      console.log('====================================');
    } else {
      console.log(`Super Admin user already exists. Email: ${superAdminEmail}`);
      console.log('Password has NOT been reset. If you forgot the password, please use the forgot password flow or modify the DB directly.');
    }

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding Super Admin:', error);
    process.exit(1);
  }
}

seedSuperAdmin();
