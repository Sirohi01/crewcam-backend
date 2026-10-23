import mongoose from 'mongoose';
import { Candidate } from './src/models/Candidate';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crewcam');
    
    // Find all candidates with hrScore
    const candidates = await Candidate.find({ 'applicationDetails.hrScore': { $exists: true } });
    console.log(`Found ${candidates.length} candidates with hrScore.`);
    
    for (const c of candidates) {
      const score = (c.applicationDetails as any).hrScore;
      console.log(`Candidate ${c.firstName} ${c.lastName} has hrScore ${score}`);
      const newStatus = score > 75 ? 'Offered' : 'Rejected'; // 75 is the criteria in frontend
      if (c.status !== newStatus) {
        c.status = newStatus;
        await c.save();
        console.log(`Updated to ${newStatus}`);
      }
    }
    
    // Check if Charu specifically needs an update based on interview rating
    const charu = await Candidate.findOne({ firstName: { $regex: /charu/i } });
    if (charu) {
       console.log('Charu found:', charu.status, charu.applicationDetails);
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
