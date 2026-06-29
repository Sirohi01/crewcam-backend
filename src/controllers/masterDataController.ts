import { Response } from 'express';
import mongoose, { Model } from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { LeaveType } from '../models/LeaveType';
import { Degree } from '../models/Degree';
import { Mark } from '../models/Mark';
import { Level } from '../models/Level';
import { Subject } from '../models/Subject';
import { Policy } from '../models/Policy';
import { AttendanceRule } from '../models/AttendanceRule';
import { RelaxationRule } from '../models/RelaxationRule';
import { LeaveNature } from '../models/LeaveNature';
import { BankName } from '../models/BankName';
import { ExpenseHead } from '../models/ExpenseHead';
import { Holiday } from '../models/Holiday';
import { Status } from '../models/Status';
import { ITInventory } from '../models/ITInventory';
import { Stationery } from '../models/Stationery';
import { Provider } from '../models/Provider';
import { Brand } from '../models/Brand';
import { Service } from '../models/Service';
import { MobileService } from '../models/MobileService';
import { UtilityProvider } from '../models/UtilityProvider';
import { QuestionPaper } from '../models/QuestionPaper';
import { OptionQuestion } from '../models/OptionQuestion';
import { ShiftTiming } from '../models/ShiftTiming';

type MasterModel = Model<any>;

const tenantIdOf = (req: AuthRequest) => req.tenantId || req.user?.tenantId?.toString();
const requireTenantId = (req: AuthRequest) => {
  const tenantId = tenantIdOf(req);
  if (!tenantId) throw new Error('Tenant context is required');
  return tenantId;
};

const normalizeBody = (body: any) => ({
  name: body.name,
  code: body.code,
  description: body.description,
  level: body.level,
  category: body.category,
  effectiveDate: body.effectiveDate,
  metadata: body.metadata,
  defaultDays: body.defaultDays === '' || body.defaultDays === undefined ? undefined : Number(body.defaultDays),
  isPaid: body.isPaid,
  isActive: body.isActive,
});

const makeHandlers = (ModelRef: MasterModel, label: string) => {
  const list = async (req: AuthRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string || '';

      const query: any = { tenantId: requireTenantId(req), isActive: true };
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { code: { $regex: search, $options: 'i' } }
        ];
      }
      // Lets a module (e.g. Meetings) load only its own slice of a shared master-data
      // list, like Status, via ?category=Meeting — without this every consumer would
      // see every other module's status values mixed in.
      if (req.query.category) {
        query.category = req.query.category;
      }

      const [items, total] = await Promise.all([
        ModelRef.find(query)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .populate('createdBy', 'firstName lastName email')
          .populate('updatedBy', 'firstName lastName email')
          .lean(),
        ModelRef.countDocuments(query)
      ]);

      res.status(200).json({
        data: items,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
      });
    } catch (error: any) {
      res.status(500).json({ message: `Error fetching ${label}`, ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
    }
  };

  const create = async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = requireTenantId(req);
      const payload = normalizeBody(req.body);
      const duplicateQuery: any = { tenantId, isActive: true, $or: [{ name: payload.name }] };
      if (payload.code) duplicateQuery.$or.push({ code: payload.code });
      const duplicate = await ModelRef.findOne(duplicateQuery as any);
      if (duplicate) return res.status(400).json({ message: `${label} with same name or code already exists` });

      const item = new ModelRef({
        ...payload,
        tenantId,
        createdBy: req.user?._id,
      });
      await item.save();
      res.status(201).json(item);
    } catch (error: any) {
      res.status(400).json({ message: `Error creating ${label}`, ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
    }
  };

  const update = async (req: AuthRequest, res: Response) => {
    try {
      const payload = normalizeBody(req.body);
      const updatePayload: any = { ...payload };
      delete updatePayload.defaultDays;
      delete updatePayload.isPaid;
      Object.keys(updatePayload).forEach((key) => updatePayload[key] === undefined && delete updatePayload[key]);
      const item = await ModelRef.findOneAndUpdate(
        { _id: req.params.id, tenantId: requireTenantId(req) } as any,
        { $set: { ...updatePayload, updatedBy: req.user?._id } },
        { returnDocument: 'after', runValidators: true }
      );
      if (!item) return res.status(404).json({ message: `${label} not found` });
      res.status(200).json(item);
    } catch (error: any) {
      res.status(400).json({ message: `Error updating ${label}`, ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
    }
  };

  const remove = async (req: AuthRequest, res: Response) => {
    try {
      const item = await ModelRef.findOneAndUpdate(
        { _id: req.params.id, tenantId: requireTenantId(req) } as any,
        { isActive: false, updatedBy: req.user?._id },
        { returnDocument: 'after' }
      );
      if (!item) return res.status(404).json({ message: `${label} not found` });
      res.status(200).json({ message: `${label} deleted successfully` });
    } catch (error: any) {
      res.status(500).json({ message: `Error deleting ${label}`, ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
    }
  };

  return { list, create, update, remove };
};

const makeLeaveTypeHandlers = () => {
  const base = makeHandlers(LeaveType, 'leave type');
  return {
    ...base,
    create: async (req: AuthRequest, res: Response) => {
      try {
        const tenantId = requireTenantId(req);
        const { name, code, defaultDays, isPaid = true, description } = req.body;
        const duplicate = await LeaveType.findOne({ tenantId, isActive: true, $or: [{ name }, { code }] } as any);
        if (duplicate) return res.status(400).json({ message: 'Leave type with same name or code already exists' });
        const item = new LeaveType({
          name,
          code,
          defaultDays: Number(defaultDays),
          isPaid,
          description,
          tenantId,
          createdBy: req.user?._id,
        });
        await item.save();
        res.status(201).json(item);
      } catch (error: any) {
        res.status(400).json({ message: 'Error creating leave type', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
      }
    },
    update: async (req: AuthRequest, res: Response) => {
      try {
        const { name, code, defaultDays, isPaid, isActive, description } = req.body;
        const item = await LeaveType.findOneAndUpdate(
          { _id: req.params.id, tenantId: requireTenantId(req) } as any,
          { $set: { name, code, defaultDays: Number(defaultDays), isPaid, isActive, description, updatedBy: req.user?._id } },
          { returnDocument: 'after', runValidators: true }
        );
        if (!item) return res.status(404).json({ message: 'Leave type not found' });
        res.status(200).json(item);
      } catch (error: any) {
        res.status(400).json({ message: 'Error updating leave type', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
      }
    },
  };
};

const makeShiftTimingHandlers = () => {
  const base = makeHandlers(ShiftTiming, 'shift timing');
  return {
    ...base,
    create: async (req: AuthRequest, res: Response) => {
      try {
        const tenantId = requireTenantId(req);
        const { name, code, description, checkInTime, checkOutTime, gracePeriodLC, gracePeriodEG, halfDayThresholdMHD, absentThreshold, isSandwichRuleApplicable, weekOffDays, workOnWeekOffMultiplier, workOnHolidayMultiplier } = req.body;
        const duplicate = await mongoose.model('ShiftTiming').findOne({ tenantId, isActive: true, $or: [{ name }, { code: code || undefined }] } as any);
        if (duplicate) return res.status(400).json({ message: 'Shift timing with same name or code already exists' });
        const item = new ShiftTiming({
          name, code, description, checkInTime, checkOutTime, gracePeriodLC: Number(gracePeriodLC), gracePeriodEG: Number(gracePeriodEG), halfDayThresholdMHD: Number(halfDayThresholdMHD), absentThreshold, isSandwichRuleApplicable, weekOffDays, workOnWeekOffMultiplier: Number(workOnWeekOffMultiplier), workOnHolidayMultiplier: Number(workOnHolidayMultiplier),
          tenantId,
          createdBy: req.user?._id,
        });
        await item.save();
        res.status(201).json(item);
      } catch (error: any) {
        res.status(400).json({ message: 'Error creating shift timing', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
      }
    },
    update: async (req: AuthRequest, res: Response) => {
      try {
        const { name, code, description, checkInTime, checkOutTime, gracePeriodLC, gracePeriodEG, halfDayThresholdMHD, absentThreshold, isSandwichRuleApplicable, weekOffDays, workOnWeekOffMultiplier, workOnHolidayMultiplier, isActive } = req.body;
        const item = await mongoose.model('ShiftTiming').findOneAndUpdate(
          { _id: req.params.id, tenantId: requireTenantId(req) } as any,
          { $set: { name, code, description, checkInTime, checkOutTime, gracePeriodLC: Number(gracePeriodLC), gracePeriodEG: Number(gracePeriodEG), halfDayThresholdMHD: Number(halfDayThresholdMHD), absentThreshold, isSandwichRuleApplicable, weekOffDays, workOnWeekOffMultiplier: Number(workOnWeekOffMultiplier), workOnHolidayMultiplier: Number(workOnHolidayMultiplier), isActive, updatedBy: req.user?._id } } as any,
          { returnDocument: 'after', runValidators: true } as any
        );
        if (!item) return res.status(404).json({ message: 'Shift timing not found' });
        res.status(200).json(item);
      } catch (error: any) {
        res.status(400).json({ message: 'Error updating shift timing', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
      }
    },
  };
};

const handlers = {
  leaveTypes: makeLeaveTypeHandlers(),
  shiftTimings: makeShiftTimingHandlers(),
  degrees: makeHandlers(Degree, 'degree'),
  marks: makeHandlers(Mark, 'mark'),
  levels: makeHandlers(Level, 'level'),
  subjects: makeHandlers(Subject, 'subject'),
  policies: makeHandlers(Policy, 'policy'),
  attendanceRules: makeHandlers(AttendanceRule, 'attendance rule'),
  relaxationRules: makeHandlers(RelaxationRule, 'relaxation rule'),
  leaveNatures: makeHandlers(LeaveNature, 'leave nature'),
  bankNames: makeHandlers(BankName, 'bank name'),
  expenseHeads: makeHandlers(ExpenseHead, 'expense head'),
  holidays: makeHandlers(Holiday, 'holiday'),
  statuses: makeHandlers(Status, 'status'),
  itInventories: makeHandlers(ITInventory, 'IT inventory'),
  stationeries: makeHandlers(Stationery, 'stationery'),
  providers: makeHandlers(Provider, 'provider'),
  brands: makeHandlers(Brand, 'brand'),
  services: makeHandlers(Service, 'service'),
  mobileServices: makeHandlers(MobileService, 'mobile service'),
  utilityProviders: makeHandlers(UtilityProvider, 'utility provider'),
  questionPapers: makeHandlers(QuestionPaper, 'question paper'),
  optionQuestions: makeHandlers(OptionQuestion, 'option question'),
};

export const getLeaveTypes = handlers.leaveTypes.list;
export const createLeaveType = handlers.leaveTypes.create;
export const updateLeaveType = handlers.leaveTypes.update;
export const deleteLeaveType = handlers.leaveTypes.remove;

export const getDegrees = handlers.degrees.list;
export const createDegree = handlers.degrees.create;
export const updateDegree = handlers.degrees.update;
export const deleteDegree = handlers.degrees.remove;

export const masterHandlers = handlers;
