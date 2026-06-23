const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const SidebarConfigSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId },
  section: { type: String, required: true },
  sectionOrder: { type: Number, required: true, default: 999 },
  label: { type: String, required: true },
  href: { type: String, required: true },
  icon: { type: String, default: 'Circle' },
  order: { type: Number, required: true, default: 0 },
  parent: { type: String },
  categories: [{ type: String }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const SidebarConfig = mongoose.models.SidebarConfig || mongoose.model('SidebarConfig', SidebarConfigSchema);

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/CREWCAM');
  await SidebarConfig.updateOne(
    { href: '/dashboard/live-tracking' }, 
    { $set: { section: 'Meeting Section', sectionOrder: 4 } }
  );
  console.log('Updated to Meeting Section');
  process.exit(0);
};
run();
