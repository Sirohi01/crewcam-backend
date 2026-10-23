import mongoose from 'mongoose';
import { Candidate } from './src/models/Candidate';

mongoose.connect('mongodb://localhost:27017/crewcam').then(async () => {
  const c = await Candidate.findOne({ firstName: 'Geetanajli' });
  console.log(JSON.stringify(c, null, 2));
  process.exit(0);
});
