const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: '../.env' });

const LiveTrackingConsentSchema = new mongoose.Schema({
  tenantId: mongoose.Schema.Types.ObjectId,
  userId: mongoose.Schema.Types.ObjectId,
  consentGiven: Boolean,
}, { strict: false });
const LiveTrackingConsent = mongoose.models.LiveTrackingConsent || mongoose.model('LiveTrackingConsent', LiveTrackingConsentSchema);

const liveTrackingLogSchema = new mongoose.Schema({
  tenantId: mongoose.Schema.Types.ObjectId,
  userId: mongoose.Schema.Types.ObjectId,
  lat: Number,
  lng: Number,
  recordedAt: Date,
}, { strict: false });
const LiveTrackingLog = mongoose.models.LiveTrackingLog || mongoose.model('LiveTrackingLog', liveTrackingLogSchema);

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  tenantId: mongoose.Schema.Types.ObjectId,
}, { strict: false });
const User = mongoose.models.User || mongoose.model('User', userSchema);

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/CREWCAM');

  const sanaya = await User.findOne({ firstName: 'Shanya', lastName: 'Singh' });
  const tenantId = sanaya.tenantId;

  console.log("Tenant ID: ", tenantId);
  const consentedUserIds = (
    await LiveTrackingConsent.find({ tenantId, consentGiven: true }).select('userId')
  ).map((c) => c.userId);

  console.log("Consented Users: ", consentedUserIds);

  const scopeFilter = { tenantId };

  const latestByUser = await LiveTrackingLog.aggregate([
    { $match: { ...scopeFilter, userId: { $in: consentedUserIds } } },
    { $sort: { recordedAt: -1 } },
    { $group: { _id: '$userId', lat: { $first: '$lat' }, lng: { $first: '$lng' }, recordedAt: { $first: '$recordedAt' } } },
  ]);

  console.log("Latest By User: ", latestByUser);

  process.exit(0);
};

run().catch(console.error);
