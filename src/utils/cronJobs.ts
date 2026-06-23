import cron from 'node-cron';
import moment from 'moment';
import { User } from '../models/User';
import { Attendance } from '../models/Attendance';
import { ShiftTiming } from '../models/ShiftTiming';
import { LeaveRequest } from '../models/LeaveRequest';

export const startCronJobs = () => {
  // Run every night at 11:59 PM
  cron.schedule('59 23 * * *', async () => {
    console.log('[CRON] Running End-Of-Day Auto-Leave Cron Job');
    try {
      const today = moment().startOf('day').toDate();
      
      // Get all active employees with shift timings
      const users = await User.find({ isActive: true, employmentStatus: 'active' }).populate('shiftTimingId');

      for (const user of users) {
        // Check if they clocked in today
        const attendance = await Attendance.findOne({ userId: user._id, date: { $gte: today } });
        if (attendance) {
          // They checked in.
          continue;
        }

        // Did they have an approved leave for today?
        const leave = await LeaveRequest.findOne({
          userId: user._id,
          status: 'Approved',
          fromDate: { $lte: moment().endOf('day').toDate() },
          toDate: { $gte: today }
        });

        if (leave) {
          // Already on leave, mark attendance as 'On Leave'
          await Attendance.create({
            tenantId: user.tenantId,
            userId: user._id,
            date: today,
            clockInTime: today, // Required by schema
            status: 'On Leave',
            locationIp: 'SYSTEM_CRON'
          });
          continue;
        }

        // Check if it's a week-off according to their shift timing
        const dayOfWeek = moment().format('dddd');
        const shiftTiming = user.shiftTimingId as any;
        if (shiftTiming && shiftTiming.weekOffDays && shiftTiming.weekOffDays.includes(dayOfWeek)) {
          // It's a week off, do not mark absent
          continue;
        }

        // If not on leave and not a week-off, mark Absent
        await Attendance.create({
          tenantId: user.tenantId,
          userId: user._id,
          date: today,
          clockInTime: today, // Required by schema
          status: 'Absent',
          locationIp: 'SYSTEM_CRON'
        });
      }
      console.log('[CRON] Auto-Leave Cron Job completed successfully.');
    } catch (err) {
      console.error('[CRON] Error running auto-leave cron job:', err);
    }
  });
};
