import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/namoCrewcam';

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to DB:', MONGODB_URI);

    const items = await mongoose.connection.collection('sidebarconfigs').find({}).toArray();
    console.log(`Found ${items.length} sidebar items in total.`);

    // Group by tenantId + href
    const seen = new Map<string, any>();
    let deletedCount = 0;

    for (const item of items) {
      const tenantId = item.tenantId ? item.tenantId.toString() : 'global';
      const key = `${tenantId}::${item.href}`;

      if (seen.has(key)) {
        // It's a duplicate, delete it
        await mongoose.connection.collection('sidebarconfigs').deleteOne({ _id: item._id });
        console.log(`Deleted duplicate: ${item.label} (${item.href}) for tenant ${tenantId}`);
        deletedCount++;
      } else {
        seen.set(key, item);
      }
    }

    console.log(`Done! Deleted ${deletedCount} duplicate items.`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from DB.');
  }
}

run();
