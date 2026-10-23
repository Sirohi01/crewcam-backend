const mongoose = require('mongoose');

async function getCandidateId() {
  try {
    await mongoose.connect('mongodb://localhost:27017/crewcam'); // Assuming 'crewcam' is the DB name
    
    // We don't have the exact model, but we can query the 'candidates' collection directly
    const db = mongoose.connection.useDb('crewcam');
    const collection = db.collection('candidates');
    const candidate = await collection.findOne({});
    
    if (candidate) {
      console.log('CANDIDATE_ID:', candidate._id.toString());
      console.log('CANDIDATE_NAME:', candidate.firstName, candidate.lastName);
    } else {
      console.log('NO_CANDIDATES_FOUND');
    }
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    mongoose.disconnect();
  }
}

getCandidateId();
