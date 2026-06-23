require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/CREWCAM').then(async () => {
  const db = mongoose.connection.db;
  const items = await db.collection('sidebarconfigs').find({ section: { $regex: /hr.?core/i } }).toArray();
  console.log('MATCHES:', JSON.stringify(items, null, 2));
  const distinctSections = await db.collection('sidebarconfigs').distinct('section');
  console.log('ALL SECTIONS:', distinctSections);
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
