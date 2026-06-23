const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: '../.env' });

const LiveTrackingConsent = mongoose.model('LiveTrackingConsent', new mongoose.Schema({}, { strict: false }));
const LiveTrackingLog = mongoose.model('LiveTrackingLog', new mongoose.Schema({}, { strict: false }));

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/CREWCAM');

  const tenantIdStr = '6a31399a1c1b47795025af22'; // Manish's tenant string

  const tenantObjId = new mongoose.Types.ObjectId(tenantIdStr);

  const consentedUserIds = (
    await LiveTrackingConsent.find({ tenantId: tenantObjId, consentGiven: true }).select('userId')
  ).map((c) => new mongoose.Types.ObjectId(c.userId));
  
  console.log("Consented users count:", consentedUserIds.length);
  console.log("Consented user IDs:", consentedUserIds);

  const scopeFilter = { tenantId: tenantIdStr };
  const matchFilter = { ...scopeFilter, userId: { $in: consentedUserIds } };
  if (matchFilter.tenantId) matchFilter.tenantId = new mongoose.Types.ObjectId(matchFilter.tenantId);

  console.log("Match filter:", JSON.stringify(matchFilter));

  const latestByUser = await LiveTrackingLog.aggregate([
    { $match: matchFilter },
    { $sort: { recordedAt: -1 } },
    { $group: { _id: '$userId', lat: { $first: '$lat' }, lng: { $first: '$lng' }, recordedAt: { $first: '$recordedAt' } } },
  ]);

  console.log("Result:", latestByUser);

  process.exit(0);
};

run().catch(console.error);
