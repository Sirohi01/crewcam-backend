import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// The source URI given in your previous .env
const SOURCE_URI = process.env.OLD_MONGODB_URI'';

// Target URI is the one currently active in .env
const TARGET_URI = process.env.MONGODB_URI;

// List of main required tables/collections to migrate
const COLLECTIONS_TO_MIGRATE = [
  // Core system setup
  'packages',
  'tenants',
  'companies',
  
  // Organization Structure & Users
  'roles',
  'branches',
  'departments',
  'designations',
  'users',
  
  // UI & Features
  'sidebarconfigs',
  'featureflags',
  
  // Master Data / Settings
  'leavetypes',
  'leavenatures',
  'banknames',
  'levels',
  'statuses',
  'shifttimings',
  'policies',
  'attendancerules',
  'holidaygroups' // Ensure holidays are also copied if they exist
];

async function migrate() {
  if (!TARGET_URI) {
    console.error('Target MONGODB_URI is not defined in .env');
    process.exit(1);
  }

  console.log('Connecting to Source Database (expo_admin)...');
  const sourceConnection = await mongoose.createConnection(SOURCE_URI).asPromise();
  console.log('Connected to Source!');

  console.log('Connecting to Target Database (Current)...');
  const targetConnection = await mongoose.createConnection(TARGET_URI).asPromise();
  console.log('Connected to Target!');

  let totalMigrated = 0;

  for (const collectionName of COLLECTIONS_TO_MIGRATE) {
    console.log(`\nMigrating collection: ${collectionName}...`);
    try {
      const sourceDb = sourceConnection.db;
      const targetDb = targetConnection.db;

      if (!sourceDb || !targetDb) throw new Error('DB is not accessible');

      const docs = await sourceDb.collection(collectionName).find({}).toArray();
      console.log(`Found ${docs.length} documents in source.`);

      if (docs.length > 0) {
        // Optional: clear existing data in the target db first
        await targetDb.collection(collectionName).deleteMany({});
        
        // Insert all documents
        await targetDb.collection(collectionName).insertMany(docs);
        console.log(`Successfully migrated ${docs.length} documents for ${collectionName}.`);
        totalMigrated += docs.length;
      } else {
        console.log(`Skipped ${collectionName} - no data found.`);
      }
    } catch (err: any) {
      console.error(`Error migrating collection ${collectionName}:`, err.message);
    }
  }

  console.log(`\nMigration complete! Total documents migrated: ${totalMigrated}`);
  await sourceConnection.close();
  await targetConnection.close();
  process.exit(0);
}

migrate().catch(console.error);
