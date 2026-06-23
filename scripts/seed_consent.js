const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: '../.env' });

const LiveTrackingConsentSchema = new mongoose.Schema({
  tenantId: mongoose.Schema.Types.ObjectId,
  userId: mongoose.Schema.Types.ObjectId,
  consentGiven: Boolean,
  consentDate: Date,
}, { strict: false });
const LiveTrackingConsent = mongoose.models.LiveTrackingConsent || mongoose.model('LiveTrackingConsent', LiveTrackingConsentSchema);

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  tenantId: mongoose.Schema.Types.ObjectId,
}, { strict: false });
const User = mongoose.models.User || mongoose.model('User', userSchema);

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/CREWCAM');

  const sanaya = await User.findOne({ firstName: 'Shanya', lastName: 'Singh' });
  if (!sanaya) {
    console.log('Shanya Singh not found!');
    process.exit(1);
  }

  await LiveTrackingConsent.findOneAndUpdate(
    { tenantId: sanaya.tenantId, userId: sanaya._id },
    { $set: { consentGiven: true, consentDate: new Date() } },
    { upsert: true }
  );

  console.log('Consent granted for Shanya Singh.');
  process.exit(0);
};

run().catch(console.error);
