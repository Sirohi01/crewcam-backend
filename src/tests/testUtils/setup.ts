import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcrypt';
import { app } from '../../app';
import { User } from '../../models/User';
import { Role } from '../../models/Role';
import { signAccessToken } from '../../utils/authTokens';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

let mongod: MongoMemoryServer | null = null;

export async function connectTestDB() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

export async function disconnectTestDB() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

export async function clearTestDB() {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key]!.deleteMany({});
  }
}

const SUPER_ADMIN_TENANT_ID = 'SUPER_ADMIN_TEST';

export async function createSuperAdmin(emailSuffix = '') {
  const role = await new Role({
    name: 'Super Admin',
    description: 'Global system administrator',
    permissions: ['*'],
    tenantId: SUPER_ADMIN_TENANT_ID,
  }).save();

  const passwordHash = await bcrypt.hash('Sup3rSecret!', 10);
  const user = await new User({
    email: `super-admin${emailSuffix}@test.crewcam.app`,
    passwordHash,
    firstName: 'Super',
    lastName: 'Admin',
    roleId: role._id,
    tenantId: SUPER_ADMIN_TENANT_ID,
    isActive: true,
  }).save();

  const token = signAccessToken(user);
  return { user, role, token };
}

export async function createRestrictedUser(permissions: string[] = [], emailSuffix = '') {
  const role = await new Role({
    name: 'Restricted',
    description: 'Limited access role',
    permissions,
    tenantId: SUPER_ADMIN_TENANT_ID,
  }).save();

  const passwordHash = await bcrypt.hash('Sup3rSecret!', 10);
  const user = await new User({
    email: `restricted${emailSuffix}@test.crewcam.app`,
    passwordHash,
    firstName: 'Restricted',
    lastName: 'User',
    roleId: role._id,
    tenantId: SUPER_ADMIN_TENANT_ID,
    isActive: true,
  }).save();

  const token = signAccessToken(user);
  return { user, role, token };
}

export function authHeader(token: string) {
  return `Bearer ${token}`;
}

export { app };
