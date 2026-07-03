import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { User } from '../src/models/User';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/CREWCAM';
const NEW_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123';
const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@crewcam.app';

async function resetPassword() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const user = await User.findOne({ email: ADMIN_EMAIL }).setOptions({ bypassTenantIsolation: true });
    if (!user) {
      console.error(`No user found with email: ${ADMIN_EMAIL}`);
      console.log('Run seedSuperAdmin.ts first to create the admin user.');
      process.exit(1);
    }

    user.passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);
    user.failedLoginAttempts = 0;
    user.lockoutUntil = undefined as any;
    await user.save();

    console.log(`Password reset successfully for ${ADMIN_EMAIL}`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error resetting password:', error);
    process.exit(1);
  }
}

resetPassword();
