import mongoose from 'mongoose';
import { Tenant } from '../src/models/Tenant';
import { Package } from '../src/models/Package';

mongoose.connect(process.env.MONGODB_URI as string)
  .then(async () => {
    const enterprisePkg = await Package.findOne({ name: 'Enterprise' });
    if (enterprisePkg) {
      await Tenant.updateMany({}, { $set: { packageId: enterprisePkg._id } });
      console.log('Successfully updated all tenants to Enterprise package');
    } else {
      console.log('Enterprise package not found');
    }
    process.exit(0);
  });
