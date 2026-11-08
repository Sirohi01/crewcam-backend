import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { app } from './app';
import { startRetentionJobs } from './utils/retentionJobs';
import { startCronJobs } from './utils/cronJobs';
import { startAutomationJobs } from './utils/automationJobs';
import { startGoLiveJobs } from './utils/goLiveJobs';

dotenv.config();

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}

const PORT = process.env.PORT || 8000;

// All middleware and routes live in app.ts (createApp), which the tests exercise too.
// This file must not register any: it used to re-mount the whole stack a second time,
// so any request app.ts did not match fell through into a duplicate copy — including
// an unauthenticated budget-allocation router that existed nowhere else.

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/crewcam';

mongoose.connect(MONGODB_URI, { maxPoolSize: 20 })
  .then(() => {
    console.log('Connected to MongoDB');
    startRetentionJobs();
    startCronJobs();
    startAutomationJobs();
    startGoLiveJobs();
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  });
