require('dotenv').config();
const mongoose = require('mongoose');

const tenantId = '6a31399a1c1b47795025af22';

// We just connect to mongoose and update the order of sidebar items based on DEFAULT_SIDEBAR_ITEMS.
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/CREWCAM').then(async () => {
  console.log('Fixing Sidebar Order...');
  const { SidebarConfig } = require('./src/models/SidebarConfig');
  const { DEFAULT_SIDEBAR_ITEMS } = require('./src/utils/sidebarDefaults');
  
  for (const item of DEFAULT_SIDEBAR_ITEMS) {
    await SidebarConfig.updateOne(
      { tenantId, section: item.section, label: item.label },
      { $set: { order: item.order, parent: item.parent } }
    );
  }
  
  console.log('Sidebar Order Fixed Successfully!');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
