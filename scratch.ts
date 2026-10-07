import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hrcrm');
  
  const tenants = await mongoose.connection.collection('tenants').find({}).toArray();
  for (const t of tenants) {
    console.log(`Tenant: ${t.name} (ID: ${t._id})`);
    console.log(`Modules:`, JSON.stringify(t.modules, null, 2));
    console.log(`Allowed Sections:`, JSON.stringify(t.allowedSections, null, 2));
  }
  process.exit(0);
}

run().catch(console.error);
