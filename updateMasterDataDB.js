const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://localhost:27017/CREWCAM');
  const db = mongoose.connection.db;

  console.log('Removing old generic Master Data sidebar item...');
  await db.collection('sidebarconfigs').deleteMany({ label: 'Master Data', section: 'Company Setup' });
  
  console.log('Removing scattered old built master data items from Admin Section...');
  const oldBuiltItems = [
    'Add Question Paper', 'Add Mobile Services', 'Add Service Provider', 'Add Status', 'Add leave Name',
    'Add Nature of leave', 'Add IT Inventory', 'Add stationary', 'Add Degree', 'Add Marks',
    'Add Relaxation Rule', 'Add Attendance Rule', 'Expense Head', 'Add Office Holiday',
    'Add Option Question', 'Add Bank Name', 'Add Levels', 'Add Subjects', 'Add Policies',
  ];
  await db.collection('sidebarconfigs').deleteMany({ label: { $in: oldBuiltItems } });

  console.log('Removing any previously added new master data items to prevent duplicates...');
  await db.collection('sidebarconfigs').deleteMany({ parent: 'Master Data' });

  console.log('Migration complete. Run the backend and seedSync will insert the new Master Data items automatically.');
  process.exit(0);
}

run();
