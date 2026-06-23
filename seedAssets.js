require('dotenv').config();
const mongoose = require('mongoose');
const { Asset } = require('./src/models/Asset');

const tenantId = '6a31399a1c1b47795025af22';

const assets = [
  { name: 'MacBook Pro 14" M3', type: 'Laptop', serialNumber: 'AST-LAP-0001' },
  { name: 'Dell Latitude 5440', type: 'Laptop', serialNumber: 'AST-LAP-0002' },
  { name: 'Lenovo ThinkPad X1 Carbon', type: 'Laptop', serialNumber: 'AST-LAP-0003' },
  { name: 'HP EliteBook 840', type: 'Laptop', serialNumber: 'AST-LAP-0004' },
  { name: 'iPhone 14', type: 'Mobile', serialNumber: 'AST-MOB-0001' },
  { name: 'Samsung Galaxy S23', type: 'Mobile', serialNumber: 'AST-MOB-0002' },
  { name: 'OnePlus Nord CE 3', type: 'Mobile', serialNumber: 'AST-MOB-0003' },
  { name: 'iPad Air', type: 'Tablet', serialNumber: 'AST-TAB-0001' },
  { name: 'Samsung Galaxy Tab S9', type: 'Tablet', serialNumber: 'AST-TAB-0002' },
  { name: 'Maruti Suzuki Dzire (Company Cab)', type: 'Vehicle', serialNumber: 'AST-VEH-0001' },
  { name: 'Honda Activa (Delivery)', type: 'Vehicle', serialNumber: 'AST-VEH-0002' },
  { name: 'Dell 24" Monitor', type: 'Other', serialNumber: 'AST-OTH-0001' },
  { name: 'Logitech MX Master 3 Mouse', type: 'Other', serialNumber: 'AST-OTH-0002' },
];

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/CREWCAM').then(async () => {
  for (const item of assets) {
    await Asset.findOneAndUpdate(
      { serialNumber: item.serialNumber, tenantId },
      { ...item, tenantId, status: 'Available', purchaseDate: new Date() },
      { upsert: true }
    );
  }
  console.log(`Seeded ${assets.length} assets.`);
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
