import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Attendance } from '../models/Attendance';
import { OutInRecord } from '../models/OutInRecord';
import { Role, resolveRoleScope } from '../models/Role';
import { User } from '../models/User';
import { Branch } from '../models/Branch';
import { getUserScopeFilter, canAccessUser } from '../utils/scopeHelpers';
import moment from 'moment';

const getDistanceInMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // metres
  const phi1 = lat1 * Math.PI/180;
  const phi2 = lat2 * Math.PI/180;
  const deltaPhi = (lat2-lat1) * Math.PI/180;
  const deltaLambda = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
          Math.cos(phi1) * Math.cos(phi2) *
          Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
};

export const clockIn = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const tenantId = (req.tenantId || req.user.tenantId) as any;
    const userId = req.user._id as any;

    const today = moment().startOf('day').toDate();
    
    let attendance = await Attendance.findOne({
      tenantId,
      userId,
      date: { $gte: today }
    });

    if (attendance) {
      return res.status(400).json({ message: 'Already clocked in today' });
    }

    const { lat, lng } = req.body;
    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ message: 'Location (lat/lng) is required for attendance' });
    }

    const user = await User.findOne({ _id: userId, tenantId }).populate('branchId');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const branch = user.branchId as any;
    if (!branch || typeof branch.lat !== 'number' || typeof branch.lng !== 'number') {
      return res.status(400).json({ message: 'Branch location is not configured. Cannot mark attendance.' });
    }

    const distance = getDistanceInMeters(lat, lng, branch.lat, branch.lng);
    if (distance > 50) {
      return res.status(400).json({ message: `You must be within 50 meters of the branch location. You are currently ${Math.round(distance)} meters away.` });
    }

    attendance = await Attendance.create({
      tenantId,
      userId,
      date: today,
      clockInTime: new Date(),
      status: 'Present',
      locationIp: req.ip || '',
      clockInLocation: { lat, lng }
    } as any);

    res.status(201).json({ message: 'Clocked in successfully', attendance });
  } catch (error: any) {
    res.status(500).json({ message: 'Error clocking in', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const clockOut = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const tenantId = (req.tenantId || req.user.tenantId) as any;
    const userId = req.user._id as any;

    const today = moment().startOf('day').toDate();
    
    let attendance = await Attendance.findOne({
      tenantId,
      userId,
      date: { $gte: today }
    });

    if (!attendance) {
      return res.status(400).json({ message: 'Not clocked in today' });
    }

    if (attendance.clockOutTime) {
      return res.status(400).json({ message: 'Already clocked out today' });
    }

    const { lat, lng } = req.body;
    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ message: 'Location (lat/lng) is required for attendance' });
    }

    const user = await User.findOne({ _id: userId, tenantId }).populate('branchId');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const branch = user.branchId as any;
    if (!branch || typeof branch.lat !== 'number' || typeof branch.lng !== 'number') {
      return res.status(400).json({ message: 'Branch location is not configured. Cannot mark attendance.' });
    }

    const distance = getDistanceInMeters(lat, lng, branch.lat, branch.lng);
    if (distance > 50) {
      return res.status(400).json({ message: `You must be within 50 meters of the branch location. You are currently ${Math.round(distance)} meters away.` });
    }

    attendance.clockOutTime = new Date();
    attendance.clockOutLocation = { lat, lng };
    // Calculate total hours
    const duration = moment.duration(moment(attendance.clockOutTime).diff(moment(attendance.clockInTime)));
    attendance.totalHours = duration.asHours();
    await attendance.save();

    res.status(200).json({ message: 'Clocked out successfully', attendance });
  } catch (error: any) {
    res.status(500).json({ message: 'Error clocking out', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getMyAttendance = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const tenantId = (req.tenantId || req.user.tenantId) as any;
    const userId = req.user._id as any;

    const { month, year } = req.query;
    
    let query: any = { tenantId, userId };
    
    if (month && year) {
      const startDate = moment().year(Number(year)).month(Number(month) - 1).startOf('month').toDate();
      const endDate = moment().year(Number(year)).month(Number(month) - 1).endOf('month').toDate();
      query.date = { $gte: startDate, $lte: endDate };
    }

    const attendanceRecords = await Attendance.find(query).sort({ date: -1 });
    res.status(200).json(attendanceRecords);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching attendance', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getTenantAttendance = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const tenantId = (req.tenantId || req.user.tenantId) as any;

    const attendanceRecords = await Attendance.find({ tenantId }).populate('userId', 'firstName lastName email').sort({ date: -1 });
    res.status(200).json(attendanceRecords);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching tenant attendance', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

/**
 * Add Employee Out-In: short during-the-day excursions, distinct from the
 * full clock-in/clock-out attendance record (docs/modules/30_ATTENDANCE_AND_LEAVE.md).
 */
export const recordOutIn = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const tenantId = (req.tenantId || req.user.tenantId) as any;
    const { type, reason } = req.body;

    if (!['Out', 'In'].includes(type) || !reason) {
      return res.status(400).json({ message: 'type (Out/In) and reason are required' });
    }

    const record = await OutInRecord.create({
      tenantId,
      userId: req.user._id,
      type,
      reason,
      timestamp: new Date(),
    });

    res.status(201).json({ message: 'Out-In record saved', record });
  } catch (error: any) {
    res.status(500).json({ message: 'Error recording out-in', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getMyOutIn = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const tenantId = (req.tenantId || req.user.tenantId) as any;
    const today = moment().startOf('day').toDate();

    const records = await OutInRecord.find({ tenantId, userId: req.user._id, timestamp: { $gte: today } } as any).sort({ timestamp: -1 });
    res.status(200).json(records);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching out-in records', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

/**
 * Today Attendance dashboard widget: HR/HOD/Reporting Manager personas see
 * everyone in their scope's clock-in status for today; Employee sees only self.
 */
export const getTodayAttendance = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const role: any = await Role.findOne({ _id: req.user.roleId, tenantId: req.tenantId || req.user.tenantId } as any);
    const scope = resolveRoleScope(role);
    const scopeFilter = await getUserScopeFilter(req, scope);

    const today = moment().startOf('day').toDate();
    const records = await Attendance.find({ ...scopeFilter, date: { $gte: today } } as any)
      .populate('userId', 'firstName lastName email')
      .sort({ clockInTime: -1 });

    res.status(200).json(records);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching today attendance', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

/**
 * Individual Attendance drill-down: self, or — if the caller's persona scope
 * covers `userId` (own team for Reporting Manager, own department for HOD,
 * org-wide for HR/Admin) — any other employee's attendance history.
 */
export const getIndividualAttendance = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const tenantId = (req.tenantId || req.user.tenantId) as any;
    const userId = req.params.userId as string;

    const role: any = await Role.findOne({ _id: req.user.roleId, tenantId } as any);
    const scope = resolveRoleScope(role);

    const allowed = await canAccessUser(req, scope, userId);
    if (!allowed) return res.status(403).json({ message: 'Not authorized to view this employee\'s attendance' });

    const records = await Attendance.find({ tenantId, userId } as any).sort({ date: -1 });
    res.status(200).json(records);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching individual attendance', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const hrOverrideAttendance = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = (req.tenantId || req.user?.tenantId) as any;
    const { id } = req.params; // If PUT, has id
    const { userId, date, clockInTime, clockOutTime, status, reason } = req.body;

    if (id) {
      // Update existing
      const attendance = await Attendance.findOne({ _id: id, tenantId });
      if (!attendance) return res.status(404).json({ message: 'Attendance record not found' });
      
      if (clockInTime) attendance.clockInTime = new Date(clockInTime);
      if (clockOutTime) {
        attendance.clockOutTime = new Date(clockOutTime);
        if (attendance.clockInTime) {
           const duration = moment.duration(moment(attendance.clockOutTime).diff(moment(attendance.clockInTime)));
           attendance.totalHours = duration.asHours();
        }
      }
      if (status) attendance.status = status;
      // You could log the reason or updatedBy in an audit trail if needed
      await attendance.save();
      return res.status(200).json({ message: 'Attendance updated successfully', attendance });
    } else {
      // Create new
      if (!userId || !date) return res.status(400).json({ message: 'userId and date are required' });
      const payload: any = {
        tenantId,
        userId,
        date: new Date(date),
        clockInTime: clockInTime ? new Date(clockInTime) : new Date(date),
        status: status || 'Present',
        locationIp: 'HR_OVERRIDE'
      };
      if (clockOutTime) {
        payload.clockOutTime = new Date(clockOutTime);
        if (payload.clockInTime) {
          const duration = moment.duration(moment(payload.clockOutTime).diff(moment(payload.clockInTime)));
          payload.totalHours = duration.asHours();
        }
      }
      const attendance = await Attendance.create(payload as any);
      return res.status(201).json({ message: 'Attendance created successfully', attendance });
    }
  } catch (error: any) {
    res.status(500).json({ message: 'Error overriding attendance', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};
