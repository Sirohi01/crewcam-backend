import mongoose from 'mongoose';
import { Candidate } from './src/models/Candidate';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crewcam');
    const c = await Candidate.findOne({ firstName: { $regex: /charu/i } }).lean();
    console.log("Candidate found in DB:");
    console.log(JSON.stringify(c, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
