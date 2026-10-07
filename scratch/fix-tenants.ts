import mongoose from 'mongoose';
import { Tenant } from '../src/models/Tenant';
import { Package } from '../src/models/Package';

mongoose.connect('mongodb://tejodhar629_db_user:DatabaseDbUser@ac-cof2w53-shard-00-00.c9plbjn.mongodb.net:27017,ac-cof2w53-shard-00-01.c9plbjn.mongodb.net:27017,ac-cof2w53-shard-00-02.c9plbjn.mongodb.net:27017/hrcrm?ssl=true&replicaSet=atlas-diy444-shard-0&authSource=admin&appName=Cluster0')
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
