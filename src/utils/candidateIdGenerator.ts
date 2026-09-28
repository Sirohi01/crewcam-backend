import mongoose from 'mongoose';
import { Candidate } from '../models/Candidate';
import { Company } from '../models/Company';
import { Tenant } from '../models/Tenant';
import { Branch } from '../models/Branch';
import { Counter } from '../models/Counter';
import { ManpowerRequest } from '../models/ManpowerRequest';
import { HiringPipelineState } from '../models/HiringPipelineState';

/**
 * Extracts a concise short-form code from a company name (e.g., "CrewCam Technologies" -> "CCT", "CrewCam" -> "CC").
 */
export const getCompanyShortCode = (name?: string): string => {
  if (!name) return 'CC';
  // Insert spaces before capital letters for camelCase/PascalCase (e.g. "CrewCam" -> "Crew Cam")
  const separated = name.trim().replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[^a-zA-Z0-9\s]/g, '');
  const words = separated.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const initials = words.map(w => w[0]).join('').toUpperCase();
    return initials.slice(0, 4);
  }
  if (separated.length >= 2) {
    return separated.slice(0, 2).toUpperCase();
  }
  return separated.toUpperCase() || 'CC';
};

/**
 * Extracts a concise short-form code for a branch/location (e.g., "Head Office" -> "HQ", "Mohan Nagar" -> "MN").
 */
export const getBranchShortCode = async (tenantId: any, locationHint?: string): Promise<string> => {
  if (locationHint) {
    const hintLower = locationHint.toLowerCase();
    if (hintLower.includes('head office') || hintLower.includes('hq')) return 'HQ';

    // Try finding a matching branch in database
    const branchMatch = await Branch.findOne({
      tenantId,
      $or: [
        { name: new RegExp(locationHint, 'i') },
        { location: new RegExp(locationHint, 'i') },
        { city: new RegExp(locationHint, 'i') },
        { code: new RegExp(locationHint, 'i') }
      ],
      isActive: true
    } as any).lean();

    if (branchMatch?.code) return branchMatch.code.toUpperCase().slice(0, 4);
  }

  // Fallback to the first active branch with a code, or HQ
  const firstBranch = await Branch.findOne({ tenantId, isActive: true } as any).lean();
  if (firstBranch?.code) return firstBranch.code.toUpperCase().slice(0, 4);

  return 'HQ';
};

/**
 * Generates and assigns a Candidate Unique ID in the format:
 * [Company Short Form]/[Branch Short Form]/[Year 2-digit]/[Serial Number 3-digit]
 * Example: CC/HQ/26/001
 * 
 * If the candidate already has an ID in this format (contains '/'), it returns the existing ID.
 */
export const generateCandidateUniqueId = async (
  tenantId: any,
  candidateId: any,
  locationHint?: string
): Promise<string> => {
  const candidate = await Candidate.findOne({ _id: candidateId, tenantId } as any);
  if (!candidate) throw new Error(`Candidate not found: ${candidateId}`);

  // If candidate already has an ID, reuse and normalize to slashes (e.g. NAM/HQ/26/0011)
  const rawCode = candidate.candidateCode || candidate.uniqueId || candidate.employeeCode;
  const existingCode = rawCode ? (/^[A-Za-z0-9]+-[A-Za-z0-9]+-[A-Za-z0-9]+-[A-Za-z0-9]+$/.test(rawCode) ? rawCode.replace(/-/g, '/') : rawCode) : '';
  if (existingCode) {
    if (candidate.candidateCode !== existingCode || candidate.uniqueId !== existingCode || candidate.employeeCode !== existingCode) {
      candidate.candidateCode = existingCode;
      candidate.uniqueId = existingCode;
      candidate.employeeCode = existingCode;
      await candidate.save();
    }
    return existingCode;
  }

  // 1. Company short form
  const [company, tenant] = await Promise.all([
    Company.findOne({ tenantId, isActive: true } as any).select('tradeName legalName').lean(),
    Tenant.findById(tenantId).select('name').lean()
  ]);
  const companyName = company?.tradeName || company?.legalName || tenant?.name || 'CrewCam';
  const companyCode = getCompanyShortCode(companyName);

  // 2. Branch short form
  let branchHint = locationHint;
  if (!branchHint) {
    const pipeline = await HiringPipelineState.findOne({ tenantId, candidateId } as any).lean();
    const manpowerRef = pipeline?.steps?.find((s: any) => s.key === 'manpowerRequest')?.refId;
    if (manpowerRef) {
      const manpower = await ManpowerRequest.findOne({ _id: manpowerRef, tenantId } as any).lean();
      branchHint = manpower?.workLocation;
      if (manpower?.locationBranchId) {
        const branch = await Branch.findOne({ _id: manpower.locationBranchId, tenantId } as any).lean();
        if (branch?.code) branchHint = branch.code;
      }
    }
  }
  const branchCode = await getBranchShortCode(tenantId, branchHint);

  // 3. Year (last 2 digits)
  const year2Digit = new Date().getFullYear().toString().slice(-2);

  // 4. Serial Number (3 digits, atomic per tenant & year)
  const counterKey = `CAND_SEQ_${String(tenantId)}_${year2Digit}`;
  const counter = await Counter.findOneAndUpdate(
    { key: counterKey },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const serial3Digit = String(counter.seq).padStart(3, '0');

  // Format: [Company]/[Branch]/[YY]/[XXX]
  const uniqueId = `${companyCode}/${branchCode}/${year2Digit}/${serial3Digit}`;

  // Persist on Candidate
  candidate.candidateCode = uniqueId;
  candidate.uniqueId = uniqueId;
  candidate.employeeCode = uniqueId;
  await candidate.save();

  return uniqueId;
};
