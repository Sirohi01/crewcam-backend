import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { SidebarConfig } from '../models/SidebarConfig';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/namoCrewcam';

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to DB:', MONGODB_URI);

    const result = await mongoose.connection.collection('sidebarconfigs').deleteMany({ href: { $regex: '^/dashboard' } });
    console.log(`Deleted ${result.deletedCount} leftover dashboard items that were incorrectly re-synced.`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from DB.');
  }
}

run();
