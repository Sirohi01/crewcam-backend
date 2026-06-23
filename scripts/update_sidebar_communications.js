const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const SidebarConfigSchema = new mongoose.Schema({
  section: { type: String },
  label: { type: String },
  href: { type: String },
}, { strict: false });

const SidebarConfig = mongoose.models.SidebarConfig || mongoose.model('SidebarConfig', SidebarConfigSchema);

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/CREWCAM');
  
  const res1 = await SidebarConfig.updateOne(
    { href: '/dashboard/communication' },
    { $set: { href: '/dashboard/communications/notifications' } }
  );
  
  const res2 = await SidebarConfig.updateOne(
    { href: '/dashboard/daily-quotes' },
    { $set: { href: '/dashboard/communications/quotes' } }
  );
  
  const res3 = await SidebarConfig.updateOne(
    { href: '/dashboard/queries' },
    { $set: { href: '/dashboard/communications/queries' } }
  );
  
  console.log('Update 1:', res1.modifiedCount);
  console.log('Update 2:', res2.modifiedCount);
  console.log('Update 3:', res3.modifiedCount);
  
  process.exit(0);
};
run();
