import mongoose from 'mongoose';
import { Attendance } from '../models/Attendance';
import moment from 'moment';
import dotenv from 'dotenv';
dotenv.config();

const fixHours = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/crucam');
    console.log('Connected to DB');
    const records = await Attendance.find({ 
      clockInTime: { $exists: true, $ne: null }, 
      clockOutTime: { $exists: true, $ne: null }, 
      $or: [
        { totalHours: { $exists: false } },
        { totalHours: null },
        { totalHours: 0 }
      ]
    }).setOptions({ bypassTenantIsolation: true });
    console.log(`Found ${records.length} records to fix`);
    
    for (const record of records) {
      if (record.clockInTime && record.clockOutTime) {
        const duration = moment.duration(moment(record.clockOutTime).diff(moment(record.clockInTime)));
        record.totalHours = duration.asHours();
        await record.save();
      }
    }
    console.log('Fixed hours');
    mongoose.disconnect();
  } catch (e) {
    console.error(e);
    mongoose.disconnect();
  }
};

fixHours();
