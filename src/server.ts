import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { app } from './app';
import { startRetentionJobs } from './utils/retentionJobs';
import { startCronJobs } from './utils/cronJobs';
import { startAutomationJobs } from './utils/automationJobs';

dotenv.config();

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}

const PORT = process.env.PORT || 8000;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/CREWCAM';
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    startRetentionJobs();
    startCronJobs();
    startAutomationJobs();
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  });
