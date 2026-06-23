import { Response } from 'express';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { Tenant } from '../models/Tenant';
import { Branch } from '../models/Branch';
import { Department } from '../models/Department';
import { Designation } from '../models/Designation';
import { Attendance } from '../models/Attendance';
import { LeaveCredit } from '../models/LeaveCredit';
import { LeaveRequest } from '../models/LeaveRequest';
import { LeaveType } from '../models/LeaveType';
import { AssetAllocation } from '../models/AssetAllocation';
import { Company } from '../models/Company';
import { AuthRequest } from '../middleware/auth';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import moment from 'moment';

const daysInclusive = (start: Date, end: Date) => moment(end).diff(moment(start), 'days') + 1;

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// Helper to check limits
const checkPackageLimit = async (tenantId: string) => {
  const tenant = await Tenant.findById(tenantId).populate('packageId');
  if (!tenant || !tenant.packageId) throw new Error('Tenant or Package not found');

  const pkg: any = tenant.packageId;
  const count = await User.countDocuments({ tenantId });
  const limit = pkg.maxUsers;

  if (count >= limit) {
    throw new Error(`Limit reached. Your package allows a maximum of ${limit} users/employees. Please upgrade your package to add more.`);
  }
};

const tenantIdOf = (req: AuthRequest) => req.tenantId || req.user?.tenantId?.toString();
const requireTenantId = (req: AuthRequest) => {
  const tenantId = tenantIdOf(req);
  if (!tenantId) throw new Error('Tenant context is required');
  return tenantId;
};

const ensureEmployeeRefs = async (tenantId: string, body: any) => {
  if (body.branchId) {
    const branch = await Branch.exists({ _id: body.branchId, tenantId, isActive: true } as any);
    if (!branch) throw new Error('Branch not found for this tenant');
  }
  if (body.departmentId) {
    const department = await Department.exists({ _id: body.departmentId, tenantId, isActive: true } as any);
    if (!department) throw new Error('Department not found for this tenant');
  }
  if (body.designationId) {
    const designation = await Designation.exists({ _id: body.designationId, tenantId, isActive: true } as any);
    if (!designation) throw new Error('Designation not found for this tenant');
  }
  if (body.reportingToId) {
    const manager = await User.exists({ _id: body.reportingToId, tenantId, isActive: true } as any);
    if (!manager) throw new Error('Reporting manager not found for this tenant');
  }
  if (body.roleId) {
    const role = await Role.exists({ _id: body.roleId, tenantId, isActive: true } as any);
    if (!role) throw new Error('Role not found for this tenant');
  }
};

const emptyToUndefined = (value: any) => value === '' ? undefined : value;

const getDefaultReportingTo = async (tenantId: string, departmentId?: string, designationId?: string, excludeEmployeeId?: string) => {
  let reportingToId: any;
  if (designationId) {
    const designation: any = await Designation.findOne({ _id: designationId, tenantId, isActive: true } as any)
      .select('reportingToEmployeeId')
      .lean();
    reportingToId = designation?.reportingToEmployeeId;
  }

  if (!reportingToId && departmentId) {
    const department: any = await Department.findOne({ _id: departmentId, tenantId, isActive: true } as any)
      .select('hodEmployeeId')
      .lean();
    reportingToId = department?.hodEmployeeId;
  }

  if (reportingToId && excludeEmployeeId && reportingToId.toString() === excludeEmployeeId) {
    return undefined;
  }
  return reportingToId;
};

const applyHierarchyAssignments = async (tenantId: string, employeeId: any, body: any, userId: any) => {
  if (body.makeDepartmentHod && body.departmentId) {
    await Department.findOneAndUpdate(
      { _id: body.departmentId, tenantId } as any,
      { $set: { hodEmployeeId: employeeId, updatedBy: userId } }
    );
  }

  if (body.makeDesignationReportingLead && body.designationId) {
    await Designation.findOneAndUpdate(
      { _id: body.designationId, tenantId } as any,
      { $set: { reportingToEmployeeId: employeeId, updatedBy: userId } }
    );
  }
};

export const getEmployees = async (req: AuthRequest, res: Response) => {
  try {
    const status = req.query.status === 'ex' ? 'ex' : 'active';
    const filter = status === 'active'
      ? { tenantId: requireTenantId(req), $or: [{ employmentStatus: 'active' }, { employmentStatus: { $exists: false } }] }
      : { tenantId: requireTenantId(req), employmentStatus: 'ex' };
    const employees = await User.find(filter as any)
      .populate('roleId', 'name')
      .populate('branchId', 'name')
      .populate('departmentId', 'name hodEmployeeId')
      .populate('designationId', 'name reportingToEmployeeId')
      .populate('reportingToId', 'firstName lastName email profilePictureUrl')
      .populate('attendanceRuleId', 'name')
      .populate('policyId', 'name')
      .populate('policyIds', 'name')
      .populate('holidayGroupId', 'name')
      .populate('jobLevelId', 'name')
      .select('-passwordHash')
      .lean();
    res.status(200).json({ data: employees });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching employees', error: (error as any).message });
  }
};

export const getEmployeeById = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const employee: any = await User.findOne({ _id: req.params.id, tenantId } as any)
      .populate('roleId', 'name')
      .populate('branchId', 'name code address location city state country pincode contactPerson contactPhone contactEmail')
      .populate('departmentId', 'name hodEmployeeId')
      .populate('designationId', 'name reportingToEmployeeId')
      .populate('reportingToId', 'firstName lastName email profilePictureUrl designationId')
      .populate('attendanceRuleId', 'name')
      .populate('policyId', 'name')
      .populate('policyIds', 'name')
      .populate('holidayGroupId', 'name')
      .populate('jobLevelId', 'name')
      .populate('allocatedInventoryIds', 'name category code')
      .select('-passwordHash')
      .lean();

    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [monthAttendance, recentAttendance, leaveCredits, approvedLeaveRequests, assetAllocations, leaveTypes, company] = await Promise.all([
      Attendance.find({ tenantId, userId: employee._id, date: { $gte: monthStart, $lte: monthEnd } } as any).lean(),
      Attendance.find({ tenantId, userId: employee._id } as any).sort({ date: -1 }).limit(5).lean(),
      LeaveCredit.find({ tenantId, userId: employee._id } as any).populate('leaveTypeId', 'name').lean(),
      LeaveRequest.find({ tenantId, userId: employee._id, status: 'Approved' } as any).lean(),
      AssetAllocation.find({ tenantId, employeeId: employee._id, status: 'Active' } as any).populate('assetId', 'name type serialNumber').lean(),
      LeaveType.find({ tenantId, isActive: true } as any).sort({ name: 1 }).lean(),
      Company.findOne({ tenantId } as any).select('legalName tradeName addressLine1 addressLine2 city state postalCode country email phone').lean(),
    ]);

    const totalWorkingDays = monthAttendance.length;
    const daysPresent = monthAttendance.filter((a: any) => a.status === 'Present' || a.status === 'Half-Day').length;
    const daysAbsent = monthAttendance.filter((a: any) => a.status === 'Absent').length;
    const daysLeave = monthAttendance.filter((a: any) => a.status === 'On Leave').length;
    const attendancePercentage = totalWorkingDays > 0 ? Number(((daysPresent / totalWorkingDays) * 100).toFixed(2)) : 0;

    const yearStart = moment().startOf('year').toDate();

    const takenThisYearByLeaveType = new Map<string, number>();
    for (const request of approvedLeaveRequests) {
      if (new Date(request.startDate) < yearStart) continue;
      const key = String(request.leaveTypeId);
      const days = daysInclusive(request.startDate, request.endDate);
      takenThisYearByLeaveType.set(key, (takenThisYearByLeaveType.get(key) || 0) + days);
    }

    const creditedByLeaveType = new Map<string, number>();
    for (const credit of leaveCredits) {
      const key = String(credit.leaveTypeId?._id || credit.leaveTypeId);
      creditedByLeaveType.set(key, (creditedByLeaveType.get(key) || 0) + credit.days);
    }

    const leaveBalance = leaveTypes.map((leaveType: any) => {
      const key = String(leaveType._id);
      const creditedDays = creditedByLeaveType.get(key) || 0;
      const takenThisYear = takenThisYearByLeaveType.get(key) || 0;
      const totalDays = (leaveType.defaultDays || 0) + creditedDays;
      return {
        leaveTypeId: key,
        leaveType: leaveType.name,
        totalDays,
        usedDays: takenThisYear,
        balanceDays: Number((totalDays - takenThisYear).toFixed(2)),
      };
    });

    const assetsAllocated = assetAllocations.map((allocation: any) => allocation.assetId).filter(Boolean);
    const inventoryAllocated = employee.allocatedInventoryIds || [];

    res.status(200).json({
      data: {
        ...employee,
        attendanceSummary: {
          totalWorkingDays,
          daysPresent,
          daysAbsent,
          daysLeave,
          attendancePercentage,
          recentAttendance,
        },
        leaveBalance,
        assetsAllocated,
        inventoryAllocated,
        company,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching employee', error: process.env.NODE_ENV === 'production' ? undefined : error.message });
  }
};

export const createEmployee = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    await checkPackageLimit(tenantId);

    await ensureEmployeeRefs(tenantId, req.body);
    const { firstName, lastName, email, password, roleId, profilePictureUrl, employeeCode, mobileNumber, dateOfJoining, dateOfBirth, gender, bloodGroup, maritalStatus, currentAddress, currentPincode, currentCity, currentState, currentCountry, permanentAddress, permanentPincode, permanentCity, permanentState, permanentCountry, panNumber, aadhaarNumber, uanNumber, emergencyContactName, emergencyContactRelation, emergencyContactNumber } = req.body;
    const branchId = emptyToUndefined(req.body.branchId);
    const departmentId = emptyToUndefined(req.body.departmentId);
    const designationId = emptyToUndefined(req.body.designationId);
    const reportingToId = emptyToUndefined(req.body.reportingToId) || await getDefaultReportingTo(tenantId, departmentId, designationId);
    const attendanceRuleId = emptyToUndefined(req.body.attendanceRuleId);
    const policyId = emptyToUndefined(req.body.policyId);
    const policyIds = Array.isArray(req.body.policyIds) ? req.body.policyIds.filter(Boolean) : [];
    const holidayGroupId = emptyToUndefined(req.body.holidayGroupId);
    const holidayGroupIds = Array.isArray(req.body.holidayGroupIds) ? req.body.holidayGroupIds.filter(Boolean) : [];
    const jobLevelId = emptyToUndefined(req.body.jobLevelId);
    const existingUser = await User.findOne({ email }).setOptions({ bypassTenantIsolation: true });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    if (password) {
      try {
        passwordSchema.parse(password);
      } catch (zodError: any) {
        return res.status(400).json({ message: zodError.errors[0].message });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password || 'P@ssw0rd123!', salt);

    const employee = new User({
      firstName,
      lastName,
      email,
      passwordHash,
      roleId,
      profilePictureUrl,
      employeeCode,
      mobileNumber,
      dateOfJoining,
      dateOfBirth,
      gender,
      bloodGroup,
      maritalStatus,
      currentAddress,
      currentPincode,
      currentCity,
      currentState,
      currentCountry,
      permanentAddress,
      permanentPincode,
      permanentCity,
      permanentState,
      permanentCountry,
      panNumber,
      aadhaarNumber,
      uanNumber,
      emergencyContactName,
      emergencyContactRelation,
      emergencyContactNumber,
      attendanceRuleId,
      policyId,
      policyIds,
      holidayGroupId,
      holidayGroupIds,
      jobLevelId,
      branchId,
      departmentId,
      designationId,
      reportingToId,
      tenantId,
      createdBy: req.user?._id
    });

    await employee.save();
    await applyHierarchyAssignments(tenantId, employee._id, { ...req.body, departmentId, designationId }, req.user?._id);
    const { passwordHash: _, ...empWithoutPassword } = employee.toObject();

    res.status(201).json({ message: 'Employee created successfully', data: empWithoutPassword });
  } catch (error: any) {
    res.status(400).json({ message: process.env.NODE_ENV === 'production' ? 'Invalid request' : error.message });
  }
};

export const updateEmployee = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    await ensureEmployeeRefs(tenantId, req.body);
    const updateData: any = { ...req.body, updatedBy: req.user?._id };
    delete updateData.password;
    delete updateData.passwordHash;
    delete updateData.tenantId;
    delete updateData.makeDepartmentHod;
    delete updateData.makeDesignationReportingLead;
    updateData.branchId = emptyToUndefined(updateData.branchId);
    updateData.departmentId = emptyToUndefined(updateData.departmentId);
    updateData.designationId = emptyToUndefined(updateData.designationId);
    updateData.attendanceRuleId = emptyToUndefined(updateData.attendanceRuleId);
    updateData.policyId = emptyToUndefined(updateData.policyId);
    if (Array.isArray(updateData.policyIds)) {
      updateData.policyIds = updateData.policyIds.filter(Boolean);
    }
    updateData.holidayGroupId = emptyToUndefined(updateData.holidayGroupId);
    if (Array.isArray(updateData.holidayGroupIds)) {
      updateData.holidayGroupIds = updateData.holidayGroupIds.filter(Boolean);
    }
    updateData.jobLevelId = emptyToUndefined(updateData.jobLevelId);
    updateData.reportingToId = emptyToUndefined(updateData.reportingToId) || await getDefaultReportingTo(
      tenantId,
      updateData.departmentId,
      updateData.designationId,
      String(req.params.id)
    );

    if (req.body.password && req.body.password.trim()) {
      if (req.body.password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters long' });
      }
      const salt = await bcrypt.genSalt(10);
      updateData.passwordHash = await bcrypt.hash(req.body.password, salt);
    }

    const employee = await User.findOneAndUpdate(
      { _id: req.params.id, tenantId } as any,
      { $set: updateData },
      { returnDocument: 'after', runValidators: true }
    ).select('-passwordHash')
      .populate('attendanceRuleId', 'name')
      .populate('policyId', 'name')
      .populate('holidayGroupId', 'name');

    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    await applyHierarchyAssignments(tenantId, employee._id, { ...req.body, departmentId: updateData.departmentId, designationId: updateData.designationId }, req.user?._id);
    res.status(200).json({ message: 'Employee updated successfully', data: employee });
  } catch (error: any) {
    res.status(400).json({ message: process.env.NODE_ENV === 'production' ? 'Invalid request' : error.message });
  }
};

export const getCurrentEmployee = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  const employee = await User.findOne({ _id: req.user._id, tenantId: requireTenantId(req) } as any)
    .populate('roleId', 'name')
    .populate('branchId', 'name lat lng address location')
    .populate('departmentId', 'name hodEmployeeId')
    .populate('designationId', 'name reportingToEmployeeId')
    .populate('reportingToId', 'firstName lastName email profilePictureUrl')
    .select('-passwordHash')
    .lean();
  res.status(200).json({ data: employee });
};

export const getExEmployees = async (req: AuthRequest, res: Response) => {
  req.query.status = 'ex';
  return getEmployees(req, res);
};

export const deleteEmployee = async (req: AuthRequest, res: Response) => {
  try {
    // Basic protection: do not allow user to delete themselves
    if (req.params.id === req.user?._id.toString()) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    await User.findOneAndUpdate(
      { _id: req.params.id, tenantId: tenantIdOf(req) } as any,
      { employmentStatus: 'ex', isActive: false, updatedBy: req.user?._id }
    );
    res.status(200).json({ message: 'Employee deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting employee', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};
