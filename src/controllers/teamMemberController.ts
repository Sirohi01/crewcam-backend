import { Request, Response } from 'express';
import mongoose from 'mongoose';
import TeamMember from '../models/TeamMember';

/**
 * Escape user-supplied text before dropping it into a $regex filter.
 * Without this, characters like `.`, `(`, `)`, `+`, `*` in the
 * `:subDepartment` URL param or the `search` query string are interpreted
 * as regex metacharacters — which can silently match the wrong records,
 * throw on invalid patterns, or open the door to a ReDoS via crafted input.
 */
const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildSubDepartmentMatch = (subDepartment: string) => ({
  $regex: `^${escapeRegex(subDepartment)}$`,
  $options: 'i',
});

// ---- Type guards / constants for the schema's literal-union fields ----
const VALID_STATUSES = ['Active', 'Inactive'] as const;
type MemberStatus = (typeof VALID_STATUSES)[number];

const VALID_EMPLOYMENT_TYPES = ['Full-Time', 'Part-Time', 'Contract'] as const;
type MemberEmploymentType = (typeof VALID_EMPLOYMENT_TYPES)[number];

const isValidStatus = (v: any): v is MemberStatus =>
  VALID_STATUSES.includes(v);

const isValidEmploymentType = (v: any): v is MemberEmploymentType =>
  VALID_EMPLOYMENT_TYPES.includes(v);

/**
 * GET
 * /sub-departments/:subDepartment/team-members
 *
 * Example:
 * /sub-departments/interior-design/team-members
 */
export const getTeamMembers = async (
  req: Request,
  res: Response
) => {
  try {
    const subDepartment = req.params.subDepartment as string;

    const {
      search,
      status,
      role,
      employmentType,
      page = '1',
      limit = '50',
    } = req.query;

    const pageNumber = Math.max(1, Number(page) || 1);
    const limitNumber = Math.min(100, Math.max(1, Number(limit) || 50));

    const filter: any = {
      subDepartment: buildSubDepartmentMatch(subDepartment),
    };

    /**
     * Search
     */
    if (search && String(search).trim()) {
      const searchText = escapeRegex(String(search).trim());

      filter.$or = [
        { firstName: { $regex: searchText, $options: 'i' } },
        { lastName: { $regex: searchText, $options: 'i' } },
        { employeeId: { $regex: searchText, $options: 'i' } },
        { email: { $regex: searchText, $options: 'i' } },
      ];
    }

    /**
     * Status
     */
    if (status && status !== 'All Status') {
      if (!['Active', 'Inactive'].includes(String(status))) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status filter',
        });
      }
      filter.status = status;
    }

    /**
     * Role
     */
    if (role && role !== 'All Roles') {
      filter.role = role;
    }

    /**
     * Employment Type
     */
    if (employmentType && employmentType !== 'All Employment Types') {
      if (!['Full-Time', 'Part-Time', 'Contract'].includes(String(employmentType))) {
        return res.status(400).json({
          success: false,
          message: 'Invalid employmentType filter',
        });
      }
      filter.employmentType = employmentType;
    }

    const skip = (pageNumber - 1) * limitNumber;

    const [members, total, activeMembers] = await Promise.all([
      TeamMember.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),

      TeamMember.countDocuments(filter),

      TeamMember.countDocuments({
        subDepartment: buildSubDepartmentMatch(subDepartment),
        status: 'Active',
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: members,
      subDepartment: {
        name: subDepartment,
        totalMembers: total,
        activeMembers,
        inactiveMembers: total - activeMembers,
      },
      pagination: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.max(1, Math.ceil(total / limitNumber)),
      },
    });
  } catch (error: any) {
    console.error('getTeamMembers:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch team members',
      error: process.env.NODE_ENV === 'production' ? undefined : error.message,
    });
  }
};


/**
 * GET ONE TEAM MEMBER
 *
 * GET
 * /sub-departments/:subDepartment/team-members/:id
 */
export const getTeamMemberById = async (req: Request, res: Response) => {
  try {
    const subDepartment = req.params.subDepartment as string;
    const id = req.params.id as string;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid team member ID',
      });
    }

    const member = await TeamMember.findOne({
      _id: id,
      subDepartment: buildSubDepartmentMatch(subDepartment),
    }).lean();

    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: member,
    });
  } catch (error: any) {
    console.error('getTeamMemberById:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch team member',
      error: process.env.NODE_ENV === 'production' ? undefined : error.message,
    });
  }
};


/**
 * POST
 *
 * /sub-departments/:subDepartment/team-members
 */
export const createTeamMember = async (req: Request, res: Response) => {
  try {
    const subDepartment = req.params.subDepartment as string;

    const {
      firstName,
      lastName,
      employeeId,
      designation,
      role,
      email,
      mobile,
      status,
      employmentType,
      avatarUrl,
      department,
      departmentId,
      reportingTo,
      joiningDate,
    } = req.body;

    if (!firstName || !String(firstName).trim()) {
      return res.status(400).json({ success: false, message: 'First name is required' });
    }

    if (!lastName || !String(lastName).trim()) {
      return res.status(400).json({ success: false, message: 'Last name is required' });
    }

    if (!employeeId || !String(employeeId).trim()) {
      return res.status(400).json({ success: false, message: 'Employee ID is required' });
    }

    if (!designation || !String(designation).trim()) {
      return res.status(400).json({ success: false, message: 'Designation is required' });
    }

    if (!role || !String(role).trim()) {
      return res.status(400).json({ success: false, message: 'Role is required' });
    }

    if (!email || !String(email).trim()) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    if (!mobile || !String(mobile).trim()) {
      return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }

    // Validate enum-like fields BEFORE hitting the DB, and narrow their
    // TypeScript type at the same time so the create() payload matches
    // the schema's literal unions exactly (fixes the red-underline error
    // on TeamMember.create({...})).
    if (status !== undefined && !isValidStatus(status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    if (employmentType !== undefined && !isValidEmploymentType(employmentType)) {
      return res.status(400).json({
        success: false,
        message: `employmentType must be one of: ${VALID_EMPLOYMENT_TYPES.join(', ')}`,
      });
    }

    const normalizedEmployeeId = String(employeeId).trim();
    const normalizedEmail = String(email).trim().toLowerCase();

    // Schema expects an ObjectId, not a raw string — validate and convert
    // it here instead of passing the string straight through.
    let departmentObjectId: mongoose.Types.ObjectId | undefined;
    if (departmentId) {
      if (!mongoose.Types.ObjectId.isValid(departmentId)) {
        return res.status(400).json({ success: false, message: 'Invalid departmentId' });
      }
      departmentObjectId = new mongoose.Types.ObjectId(departmentId);
    }

    const existing = await TeamMember.findOne({
      $or: [
        { employeeId: normalizedEmployeeId },
        { email: normalizedEmail },
      ],
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Employee ID or email already exists',
      });
    }

    const finalStatus: MemberStatus = isValidStatus(status) ? status : 'Active';
    const finalEmploymentType: MemberEmploymentType = isValidEmploymentType(employmentType)
      ? employmentType
      : 'Full-Time';

    const member = await TeamMember.create({
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      employeeId: normalizedEmployeeId,
      designation: String(designation).trim(),
      role: String(role).trim(),
      email: normalizedEmail,
      mobile: String(mobile).trim(),
      status: finalStatus,
      employmentType: finalEmploymentType,
      avatarUrl,
      department,
      ...(departmentObjectId && { departmentId: departmentObjectId }),
      subDepartment,
      reportingTo,
      ...(joiningDate && { joiningDate: new Date(joiningDate) }),
    });

    return res.status(201).json({
      success: true,
      message: 'Team member created successfully',
      data: member,
    });
  } catch (error: any) {
    console.error('createTeamMember:', error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors).map((e: any) => e.message).join(', '),
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Employee ID or email already exists',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to create team member',
      error: process.env.NODE_ENV === 'production' ? undefined : error.message,
    });
  }
};


/**
 * PUT
 *
 * /sub-departments/:subDepartment/team-members/:id
 */
export const updateTeamMember = async (req: Request, res: Response) => {
  try {
    const subDepartment = req.params.subDepartment as string;
    const id = req.params.id as string;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid team member ID',
      });
    }

    // Whitelist updatable fields. `req.body` is NOT passed through directly
    // — that would let a caller silently move a record out of this
    // sub-department, overwrite its tenantId, or set unknown fields.
    const ALLOWED_FIELDS: string[] = [
      'firstName',
      'lastName',
      'designation',
      'role',
      'email',
      'mobile',
      'status',
      'employmentType',
      'avatarUrl',
      'department',
      'departmentId',
      'reportingTo',
      'joiningDate',
    ];

    const update: Record<string, any> = {};
    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) {
        update[field] = req.body[field];
      }
    }

    // departmentId: validate + convert string -> ObjectId, same as create.
    if (update.departmentId) {
      if (!mongoose.Types.ObjectId.isValid(update.departmentId)) {
        return res.status(400).json({ success: false, message: 'Invalid departmentId' });
      }
      update.departmentId = new mongoose.Types.ObjectId(update.departmentId);
    }

    if (update.status && !isValidStatus(update.status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    if (update.employmentType && !isValidEmploymentType(update.employmentType)) {
      return res.status(400).json({
        success: false,
        message: `employmentType must be one of: ${VALID_EMPLOYMENT_TYPES.join(', ')}`,
      });
    }

    if (update.email) {
      update.email = String(update.email).trim().toLowerCase();
      const emailClash = await TeamMember.findOne({
        email: update.email,
        _id: { $ne: id },
      });
      if (emailClash) {
        return res.status(409).json({
          success: false,
          message: 'Email already in use by another team member',
        });
      }
    }

    if (update.joiningDate) {
      update.joiningDate = new Date(update.joiningDate);
    }

    const member = await TeamMember.findOneAndUpdate(
      {
        _id: id,
        subDepartment: buildSubDepartmentMatch(subDepartment),
      },
      { $set: update },
      { returnDocument: 'after', runValidators: true }
    );

    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Team member updated successfully',
      data: member,
    });
  } catch (error: any) {
    console.error('updateTeamMember:', error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors).map((e: any) => e.message).join(', '),
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Employee ID or email already exists',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to update team member',
      error: process.env.NODE_ENV === 'production' ? undefined : error.message,
    });
  }
};


/**
 * DELETE
 *
 * /sub-departments/:subDepartment/team-members/:id
 */
export const deleteTeamMember = async (req: Request, res: Response) => {
  try {
    const subDepartment = req.params.subDepartment as string;
    const id = req.params.id as string;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid team member ID',
      });
    }

    const member = await TeamMember.findOneAndDelete({
      _id: id,
      subDepartment: buildSubDepartmentMatch(subDepartment),
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Team member deleted successfully',
    });
  } catch (error: any) {
    console.error('deleteTeamMember:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete team member',
      error: process.env.NODE_ENV === 'production' ? undefined : error.message,
    });
  }
};