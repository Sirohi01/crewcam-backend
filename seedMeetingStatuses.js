require('dotenv').config();
const mongoose = require('mongoose');
const { Status } = require('./src/models/Status');

const tenantId = '6a31399a1c1b47795025af22';

const statuses = [
  { name: 'Scheduled', code: 'SCHEDULED', category: 'Meeting' },
  { name: 'Ongoing', code: 'ONGOING', category: 'Meeting' },
  { name: 'Completed', code: 'COMPLETED', category: 'Meeting' },
  { name: 'Postponed', code: 'POSTPONED', category: 'Meeting' },
  { name: 'Cancelled', code: 'CANCELLED', category: 'Meeting' },
];

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/CREWCAM').then(async () => {
  for (const item of statuses) {
    await Status.findOneAndUpdate(
      { code: item.code, tenantId },
      { ...item, tenantId, isActive: true },
      { upsert: true }
    );
  }
  console.log(`Seeded ${statuses.length} meeting statuses.`);
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
