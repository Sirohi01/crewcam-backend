const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://localhost:27017/CREWCAM');
  const db = mongoose.connection.db;
  
  await db.collection('sidebarconfigs').updateMany({ section: 'Company Setup', label: 'Company Profile' }, { $set: { order: 0 } });
  await db.collection('sidebarconfigs').updateMany({ section: 'Company Setup', label: 'Manage Branch' }, { $set: { order: 1 } });
  await db.collection('sidebarconfigs').updateMany({ section: 'Company Setup', label: 'Manage Department' }, { $set: { order: 2 } });
  await db.collection('sidebarconfigs').updateMany({ section: 'Company Setup', label: 'Manage Designation' }, { $set: { order: 3 } });
  await db.collection('sidebarconfigs').updateMany({ section: 'Company Setup', label: 'Master Data' }, { $set: { order: 4 } });
  
  console.log('Order updated');
  process.exit(0);
}

run();
