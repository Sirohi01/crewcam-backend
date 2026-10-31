import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { LeaveYearStartMonth } from '../../models/dropdowns/LeaveYearStartMonth';
import { writeAuditLog, diffFields } from '../../utils/auditLog';

const MODULE = 'Leave Year Start Month Management';
const DIFF_FIELDS = ['name', 'code', 'description', 'isActive'];

export const getAllLeaveYearStartMonths = async (req: AuthRequest, res: Response) => {
  try {
    const data = await LeaveYearStartMonth.find().populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error fetching leave year start months', error });
  }
};

export const createLeaveYearStartMonth = async (req: AuthRequest, res: Response) => {
  try {
    const data = await LeaveYearStartMonth.create({ ...req.body, createdBy: req.user?._id });
    const changes = diffFields(null, data.toObject(), DIFF_FIELDS);
    await writeAuditLog({ userId: req.user?._id, action: 'CREATE_LEAVE_YEAR_START_MONTH', module: MODULE, details: { name: data.name, changes } });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating leave year start month', error });
  }
};

export const updateLeaveYearStartMonth = async (req: AuthRequest, res: Response) => {
  try {
    const before = await LeaveYearStartMonth.findById(req.params.id).lean();
    const data = await LeaveYearStartMonth.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user?._id }, { new: true });
    if (data) {
      const changes = diffFields(before, data.toObject(), DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'UPDATE_LEAVE_YEAR_START_MONTH', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ data });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error updating leave year start month', error });
  }
};

export const deleteLeaveYearStartMonth = async (req: AuthRequest, res: Response) => {
  try {
    const data = await LeaveYearStartMonth.findByIdAndDelete(req.params.id);
    if (data) {
      const changes = diffFields(data.toObject(), null, DIFF_FIELDS);
      await writeAuditLog({ userId: req.user?._id, action: 'DELETE_LEAVE_YEAR_START_MONTH', module: MODULE, details: { name: data.name, changes } });
    }
    res.status(200).json({ message: 'Leave Year Start Month deleted successfully' });
  } catch (error) {
    if ((error as any).code === 11000) {
      return res.status(400).json({ message: 'An entry with this name already exists' });
    }
    res.status(500).json({ message: 'Error deleting leave year start month', error });
  }
};
