const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config({ path: '../.env' });

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/CREWCAM');
  const userSchema = new mongoose.Schema({}, { strict: false });
  const User = mongoose.models.User || mongoose.model('User', userSchema);

  // Find Manish or Admin
  const manish = await User.findOne({ email: 'manishsirohi023@gmail.com' });

  const token = jwt.sign(
    { userId: manish._id.toString() },
    process.env.JWT_SECRET || 'fallback_secret', // You may need the actual secret
    { expiresIn: '1h' }
  );

  try {
    const res = await fetch('http://localhost:8000/api/v1/tracking/team', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const text = await res.text();
    console.log("API Response Status:", res.status);
    console.log("API Response Data:", text);
  } catch (err) {
    console.error("API Error:", err);
  }
  process.exit(0);
};

run().catch(console.error);
