import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { InductionForm } from './src/models/InductionForm';
dotenv.config();

const uri = process.env.MONGODB_URI || '';
mongoose.connect(uri)
  .then(async () => {
    const forms = await InductionForm.find({}, null, { bypassTenantIsolation: true }).sort({createdAt: -1}).limit(5);
    console.log("Latest forms:");
    forms.forEach(f => {
      console.log(`ID: ${f._id}, candidate: ${f.candidateId}, uniqueId: ${f.uniqueId}`);
    });
    process.exit(0);
  })
  .catch(console.error);
