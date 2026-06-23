const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const SidebarConfigSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId },
  href: { type: String, required: true },
}, { timestamps: true, strict: false });

const SidebarConfig = mongoose.models.SidebarConfig || mongoose.model('SidebarConfig', SidebarConfigSchema);

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/CREWCAM');
  await SidebarConfig.updateOne(
    { href: '/dashboard/live-tracking' }, 
    { 
      $set: { 
        categories: ['employee', 'reporting_manager', 'hod', 'hr', 'hr_admin', 'finance', 'admin', 'company_admin', 'developer']
      },
      $unset: { requiredFeature: "" }
    }
  );
  console.log('Updated categories and removed requiredFeature limitation');
  process.exit(0);
};
run();
