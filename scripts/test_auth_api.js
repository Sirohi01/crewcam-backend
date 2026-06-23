const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

async function test() {
  await mongoose.connect('mongodb://127.0.0.1:27017/CREWCAM');
  const db = mongoose.connection.db;

  const manish = await db.collection('users').findOne({ email: 'manishsirohi023@gmail.com' });
  
  const token = jwt.sign(
    { id: manish._id.toString() }, // wait, is the payload `id` or `userId`?
    'super_secret_jwt_key_here',
    { expiresIn: '15d' }
  );
  
  console.log("Fetching API...");
  try {
    const res = await fetch('http://localhost:8000/api/v1/tracking/team', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Body:", text);
  } catch(e) {
    console.error(e);
  }
  process.exit();
}
test();
