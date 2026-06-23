const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: '../.env' });

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  tenantId: mongoose.Schema.Types.ObjectId,
}, { strict: false });
const User = mongoose.models.User || mongoose.model('User', userSchema);

const liveTrackingLogSchema = new mongoose.Schema({
  tenantId: mongoose.Schema.Types.ObjectId,
  userId: mongoose.Schema.Types.ObjectId,
  lat: Number,
  lng: Number,
  recordedAt: Date,
}, { strict: false });
const LiveTrackingLog = mongoose.models.LiveTrackingLog || mongoose.model('LiveTrackingLog', liveTrackingLogSchema);

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/CREWCAM');
  console.log('Connected to DB');

  const sanaya = await User.findOne({ firstName: 'Shanya', lastName: 'Singh' });
  if (!sanaya) {
    console.log('Shanya Singh not found in DB!');
    process.exit(1);
  }

  console.log(`Found Shanya Singh: ${sanaya._id}, tenantId: ${sanaya.tenantId}`);

  // Clear existing logs for Sanaya today
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  await LiveTrackingLog.deleteMany({
    userId: sanaya._id,
    recordedAt: { $gte: startOfDay }
  });
  const baseLat = 19.0596;
  const baseLng = 72.8295;

  const points = [];
  const now = new Date();
  for (let i = 0; i < 10; i++) {
    const offsetMs = (5 * 60 * 60 * 1000) - (i * 30 * 60 * 1000);
    const time = new Date(now.getTime() - offsetMs);

    points.push({
      tenantId: sanaya.tenantId,
      userId: sanaya._id,
      lat: baseLat + (Math.random() * 0.01 - 0.005),
      lng: baseLng + (Math.random() * 0.01 - 0.005),
      recordedAt: time
    });
  }

  // Also one very recent point (5 mins ago)
  points.push({
    tenantId: sanaya.tenantId,
    userId: sanaya._id,
    lat: baseLat + 0.002,
    lng: baseLng + 0.002,
    recordedAt: new Date(now.getTime() - 5 * 60 * 1000)
  });

  await LiveTrackingLog.insertMany(points);
  console.log(`Inserted ${points.length} live tracking points for Sanaya Singh.`);

  process.exit(0);
};

run().catch(console.error);
