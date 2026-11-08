import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { User } from '../models/User';
import { EmployeeProfileDetail } from '../models/EmployeeProfileDetail';
import { BankPayrollInfo } from '../models/BankPayrollInfo';

/**
 * Employee self-service ("My Profile"). Everything here is scoped to the caller: no
 * route takes a user ID, so an employee can only ever read or change their own record.
 */

const MAX_ITEMS = 25;

// Forms send '' for untouched optional inputs; treat that as "not provided".
const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);
const text = (max: number) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
const requiredText = (max: number) => z.string().trim().min(1, 'is required').max(max);
const optionalDate = z.preprocess(blankToUndefined, z.coerce.date().optional());
const optionalYear = z.preprocess(blankToUndefined, z.coerce.number().int().min(1950).max(2100).optional());
const optionalEmail = z.preprocess(blankToUndefined, z.email().max(254).optional());
const phone = z.string().trim().regex(/^[+\d][\d\s-]{5,19}$/, 'must be a valid phone number');
const optionalPhone = z.preprocess(blankToUndefined, phone.optional());

/** Fields an employee may change on their own User record. Identity, statutory IDs
 * and org placement stay HR-owned and are read-only here. */
const profileUpdateSchema = z.object({
  mobileNumber: optionalPhone,
  profilePictureUrl: text(1000),
  bloodGroup: z.preprocess(blankToUndefined, z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional()),
  maritalStatus: z.preprocess(blankToUndefined, z.enum(['single', 'married', 'divorced', 'widowed']).optional()),
  currentAddress: text(500),
  currentPincode: text(12),
  currentCity: text(100),
  currentState: text(100),
  currentCountry: text(100),
  permanentAddress: text(500),
  permanentPincode: text(12),
  permanentCity: text(100),
  permanentState: text(100),
  permanentCountry: text(100),
}).strict();

const list = <T extends z.ZodTypeAny>(item: T) => z.array(item).max(MAX_ITEMS, `at most ${MAX_ITEMS} entries`);

const SECTION_SCHEMAS = {
  familyMembers: list(z.object({
    name: requiredText(120),
    relationship: requiredText(60),
    dateOfBirth: optionalDate,
    gender: z.preprocess(blankToUndefined, z.enum(['male', 'female', 'other']).optional()),
    occupation: text(120),
    mobile: optionalPhone,
    email: optionalEmail,
    isDependent: z.boolean().default(false),
  })),
  emergencyContacts: list(z.object({
    name: requiredText(120),
    relationship: requiredText(60),
    mobile: phone,
    alternateMobile: optionalPhone,
    address: text(500),
    isPrimary: z.boolean().default(false),
  })),
  education: list(z.object({
    qualification: requiredText(120),
    institution: requiredText(200),
    board: text(200),
    yearOfPassing: optionalYear,
    score: text(20),
    mode: z.preprocess(blankToUndefined, z.enum(['Full-Time', 'Part-Time', 'Distance', 'Online']).optional()),
    specialization: text(120),
    documentUrl: text(1000),
  })),
  certifications: list(z.object({
    name: requiredText(200),
    issuedBy: text(200),
    issueDate: optionalDate,
    expiryDate: optionalDate,
    credentialId: text(120),
    documentUrl: text(1000),
  })),
  courses: list(z.object({
    name: requiredText(200),
    provider: text(200),
    year: optionalYear,
    duration: text(60),
    documentUrl: text(1000),
  })),
  experience: list(z.object({
    company: requiredText(200),
    designation: requiredText(120),
    startDate: optionalDate,
    endDate: optionalDate,
    location: text(120),
    employmentType: text(60),
    responsibilities: text(2000),
  }).refine((e) => !e.startDate || !e.endDate || e.endDate >= e.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  })),
  skills: list(z.object({
    name: requiredText(80),
    category: text(80),
    level: z.preprocess(blankToUndefined, z.enum(['Beginner', 'Intermediate', 'Advanced', 'Expert']).optional()),
    yearsOfExperience: z.preprocess(blankToUndefined, z.coerce.number().min(0).max(60).optional()),
  })),
  familyInfo: z.object({
    familyStatus: text(60),
    spouseName: text(120),
    marriageAnniversary: optionalDate,
    familyAddress: text(500),
    medicalHistory: text(1000),
    nomineeName: text(120),
    nomineeRelationship: text(60),
  }).strict(),
} as const;

export type ProfileSection = keyof typeof SECTION_SCHEMAS;
export const PROFILE_SECTIONS = Object.keys(SECTION_SCHEMAS) as ProfileSection[];

const firstIssue = (error: z.ZodError) => {
  const issue = error.issues[0];
  if (!issue) return 'Invalid input';
  const path = issue.path.filter((p) => typeof p === 'string').join('.');
  return path ? `${path} ${issue.message}` : issue.message;
};

const tenantIdOf = (req: AuthRequest) => (req.tenantId || req.user?.tenantId) as string;

/** Shows only the last 4 characters of an identifier (PAN, Aadhaar, UAN). */
const maskId = (value?: string) => (value && value.length > 4 ? `${'X'.repeat(value.length - 4)}${value.slice(-4)}` : value);

const PROFILE_PROJECTION = '-passwordHash -failedLoginAttempts -lockoutUntil -auditTrail';

const loadProfile = async (req: AuthRequest) => {
  const user = await User.findOne({ _id: req.user!._id, tenantId: tenantIdOf(req) } as any)
    .select(PROFILE_PROJECTION)
    .populate('roleId', 'name')
    .populate('branchId', 'name address location')
    .populate('departmentId', 'name')
    .populate('designationId', 'name')
    .populate('reportingToId', 'firstName lastName email profilePictureUrl designation')
    .lean();
  if (!user) return null;
  return {
    ...user,
    panNumber: maskId(user.panNumber),
    aadhaarNumber: maskId(user.aadhaarNumber),
    uanNumber: maskId(user.uanNumber),
  };
};

/** GET /me/profile */
export const getMyProfile = async (req: AuthRequest, res: Response) => {
  try {
    const profile = await loadProfile(req);
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    res.json({ data: profile });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to load profile' });
  }
};

/** PATCH /me/profile — only the self-editable fields in profileUpdateSchema. */
export const updateMyProfile = async (req: AuthRequest, res: Response) => {
  const parsed = profileUpdateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    const unknownKey = parsed.error.issues.find((i) => i.code === 'unrecognized_keys');
    return res.status(400).json({
      message: unknownKey ? 'Only contact, address, blood group, marital status and photo can be changed here. Ask HR to update other details.' : firstIssue(parsed.error),
    });
  }
  try {
    const set = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
    await User.updateOne({ _id: req.user!._id, tenantId: tenantIdOf(req) } as any, { $set: { ...set, updatedBy: req.user!._id } });
    res.json({ message: 'Profile updated', data: await loadProfile(req) });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to update profile' });
  }
};

const emptyDetails = (userId: unknown) => ({
  userId,
  familyMembers: [],
  emergencyContacts: [],
  familyInfo: {},
  education: [],
  certifications: [],
  courses: [],
  experience: [],
  skills: [],
});

/** GET /me/details — family, emergency, education, certifications, courses, experience, skills. */
export const getMyDetails = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = tenantIdOf(req);
    const doc = await EmployeeProfileDetail.findOne({ tenantId, userId: req.user!._id }).select('-auditTrail').lean();
    if (doc) return res.json({ data: doc });

    // Nothing saved yet: surface the single emergency contact captured at onboarding
    // (User.emergencyContact*) so the page isn't empty. Saved on the first edit.
    const details: any = emptyDetails(req.user!._id);
    const u = req.user!;
    if (u.emergencyContactName && u.emergencyContactNumber) {
      details.emergencyContacts = [{
        name: u.emergencyContactName,
        relationship: u.emergencyContactRelation || 'Other',
        mobile: u.emergencyContactNumber,
        isPrimary: true,
      }];
    }
    res.json({ data: details });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to load profile details' });
  }
};

/** PUT /me/details/:section — replaces one section (a list, or familyInfo) wholesale. */
export const updateMyDetailsSection = async (req: AuthRequest, res: Response) => {
  const section = req.params.section as ProfileSection;
  const schema = SECTION_SCHEMAS[section];
  if (!schema) {
    return res.status(404).json({ message: `Unknown section. Use one of: ${PROFILE_SECTIONS.join(', ')}` });
  }
  const parsed = schema.safeParse(req.body?.[section] ?? req.body);
  if (!parsed.success) return res.status(400).json({ message: firstIssue(parsed.error) });

  if (section === 'emergencyContacts') {
    const primaries = (parsed.data as Array<{ isPrimary: boolean }>).filter((c) => c.isPrimary).length;
    if (primaries > 1) return res.status(400).json({ message: 'Only one emergency contact can be primary' });
  }

  try {
    const tenantId = tenantIdOf(req);
    const doc = await EmployeeProfileDetail.findOneAndUpdate(
      { tenantId, userId: req.user!._id },
      {
        $set: { [section]: parsed.data, updatedBy: req.user!._id },
        $setOnInsert: { createdBy: req.user!._id },
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    ).select('-auditTrail').lean();
    res.json({ message: 'Saved', data: doc });
  } catch (error: any) {
    if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
    res.status(500).json({ message: 'Failed to save profile details' });
  }
};

/** GET /me/bank — read-only; account and ID numbers come back masked by the model. */
export const getMyBankDetails = async (req: AuthRequest, res: Response) => {
  try {
    // Not lean: BankPayrollInfo masks account/PAN/Aadhaar in its toJSON transform.
    const record = await BankPayrollInfo.findOne({ tenantId: tenantIdOf(req), employeeId: req.user!._id } as any)
      .sort({ updatedAt: -1 });
    if (!record) return res.json({ data: null });
    const json: any = record.toJSON();
    res.json({
      data: {
        bankName: json.bankName,
        accountHolderName: json.accountHolderName,
        accountNumber: json.accountNumber,
        ifscCode: json.ifscCode,
        micrCode: json.micrCode,
        branchName: json.branchName,
        accountType: json.accountType,
        status: json.status,
        updatedAt: json.updatedAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to load bank details' });
  }
};
