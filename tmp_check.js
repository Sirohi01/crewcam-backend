require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/CREWCAM').then(async () => {
  const db = mongoose.connection.db;
  const tenantId = '6a31399a1c1b47795025af22';
  const meetings = await db.collection('meetings').find({ tenantId, mode: 'Field' }).toArray();
  console.log('MEETINGS:', JSON.stringify(meetings.map(m => ({ title: m.title, lat: m.lat, lng: m.lng, updatedAt: m.updatedAt })), null, 2));
  const branches = await db.collection('branches').find({ tenantId }).toArray();
  console.log('BRANCHES:', JSON.stringify(branches.map(b => ({ name: b.name, lat: b.lat, lng: b.lng, updatedAt: b.updatedAt })), null, 2));
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
