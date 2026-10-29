import { Router, Request, Response } from 'express';
import multer from 'multer';
import { ManpowerRequest } from '../models/ManpowerRequest';
import { Candidate } from '../models/Candidate';
import { Tenant } from '../models/Tenant';
import { normalizeSubdomain } from '../utils/subdomain';
import { storeBuffer } from '../utils/fileStorage';
import { apiLimiter } from '../middleware/rateLimiter';

const router = Router();

const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    const error: any = new Error('Resume must be a PDF or Word document.');
    error.status = 400;
    cb(error);
  },
});

const ACTIVE_LIFECYCLE_STATUSES = ['ACTIVE', 'LIVE'];

// Every public careers endpoint resolves to one tenant's own postings, the same way
// getPublicWhitelabel (settingsController.ts) resolves branding — by subdomain, requiring
// the tenant to be active. Without this, /jobs had no tenant filter at all and mixed every
// tenant's approved, Career-Portal-published jobs into one global list.
const resolvePublicTenantId = async (subdomainParam: unknown): Promise<string | null> => {
  const subdomain = normalizeSubdomain(subdomainParam as string | undefined);
  if (!subdomain) return null;
  const tenant = await Tenant.findOne({ subdomain, isActive: true }).select('lifecycleStatus').lean();
  if (!tenant || !ACTIVE_LIFECYCLE_STATUSES.includes(tenant.lifecycleStatus)) return null;
  return String(tenant._id);
};

/**
 * GET /api/v1/careers/jobs?subdomain=<tenant-subdomain>
 * Public API to fetch one company's published jobs for its own careers page.
 */
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const { search, location, subdomain } = req.query;

    const tenantId = await resolvePublicTenantId(subdomain);
    if (!tenantId) return res.status(404).json({ message: 'Company not found' });

    const filter: any = {
      tenantId,
      publishChannels: { $in: ['Career Portal', 'Website'] }, // 'Website' is the current label; 'Career Portal' kept for jobs created before the rename
      status: 'Approved' // Only show approved jobs
    };

    if (search && String(search).trim()) {
      filter.jobTitle = { $regex: String(search).trim(), $options: 'i' };
    }

    const query = ManpowerRequest.find(filter)
      .populate('departmentId', 'name')
      .populate('locationBranchId', 'name city state')
      .sort({ createdAt: -1 });

    const jobs = await query;

    // Filter location in-memory if needed, or expand filter to location branch
    let results = jobs;
    if (location && String(location).trim()) {
      const locTerm = String(location).trim().toLowerCase();
      results = results.filter((job: any) =>
        job.workLocation?.toLowerCase().includes(locTerm) ||
        job.locationBranchId?.name?.toLowerCase().includes(locTerm) ||
        job.locationBranchId?.city?.toLowerCase().includes(locTerm)
      );
    }

    res.status(200).json({ data: results });
  } catch (error: any) {
    console.error('Error fetching career portal jobs:', error);
    res.status(500).json({ message: 'Error fetching jobs' });
  }
});

/**
 * GET /api/v1/careers/jobs/:id?subdomain=<tenant-subdomain>
 * Public API for one job's full detail, for a company's careers page.
 */
router.get('/jobs/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = await resolvePublicTenantId(req.query.subdomain);
    if (!tenantId) return res.status(404).json({ message: 'Company not found' });

    if (!String(req.params.id).match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(404).json({ message: 'Job not found' });
    }

    const job = await ManpowerRequest.findOne({
      _id: req.params.id,
      tenantId,
      publishChannels: { $in: ['Career Portal', 'Website'] },
      status: 'Approved',
    })
      .populate('departmentId', 'name')
      .populate('locationBranchId', 'name city state')
      .lean();

    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.status(200).json({ data: job });
  } catch (error: any) {
    console.error('Error fetching career portal job:', error);
    res.status(500).json({ message: 'Error fetching job' });
  }
});

/**
 * POST /api/v1/careers/jobs/:id/apply
 * Public application submission for one of a company's own published jobs. The job's own
 * tenantId is the only source of truth for which tenant the resulting candidate belongs to
 * — unlike /bharat-organic/apply, this never falls back to a freshly-minted ObjectId, so an
 * application can't land in no tenant's pipeline.
 */
router.post('/jobs/:id/apply', apiLimiter, resumeUpload.single('resume'), async (req: Request, res: Response) => {
  try {
    if (!String(req.params.id).match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(404).json({ message: 'Job not found' });
    }

    const job = await ManpowerRequest.findOne({
      _id: req.params.id,
      publishChannels: { $in: ['Career Portal', 'Website'] },
      status: 'Approved',
    }).lean();
    if (!job) return res.status(404).json({ message: 'Job not found or no longer accepting applications' });

    const { firstName, lastName, email, phone, currentCTC, expectedCTC, totalExperience, currentLocation, linkedin } = req.body;
    if (!firstName || !lastName || !email || !phone) {
      return res.status(400).json({ message: 'First name, last name, email and phone are required' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'A resume (PDF or Word document) is required' });
    }

    const resumeUrl = await storeBuffer(req.file.buffer, req.file.originalname, req.file.mimetype, req, 'crewcam_resumes');

    const candidate = await Candidate.create({
      tenantId: job.tenantId,
      firstName,
      lastName,
      email,
      phone,
      jobRole: job.jobTitle,
      departmentId: job.departmentId,
      resumeUrl,
      resumeUpdatedAt: new Date(),
      source: 'Career Portal',
      status: 'Applied',
      applicationDetails: {
        currentCTC: currentCTC || '',
        expectedCTC: expectedCTC || '',
        totalExperience: totalExperience || '',
        currentLocation: currentLocation || '',
        linkedin: linkedin || '',
        appliedVia: 'Career Portal',
        jobId: String(job._id),
      },
    });

    res.status(201).json({ message: 'Application submitted successfully', candidateId: candidate._id });
  } catch (error: any) {
    console.error('Error submitting career portal application:', error);
    res.status(500).json({ message: error.status === 400 ? error.message : 'Error submitting application' });
  }
});

/**
 * Helper to map CRM ManpowerRequest/Posted Job to Bharat Organic form schema
 */
function mapToBharatOrganic(job: any) {
  // Parse experience range from string like "2-5 Years" or "3 Years"
  let expMin = 0;
  let expMax = 5;
  if (job.experienceReq) {
    const numbers = String(job.experienceReq).match(/\d+/g);
    if (numbers && numbers.length >= 2) {
      expMin = Number(numbers[0]);
      expMax = Number(numbers[1]);
    } else if (numbers && numbers.length === 1) {
      expMin = Number(numbers[0]);
      expMax = expMin + 2;
    }
  }

  const monthlyMin = job.salaryCtcMin ? Math.round(Number(job.salaryCtcMin) / 12) : 0;
  const monthlyMax = job.salaryCtcMax ? Math.round(Number(job.salaryCtcMax) / 12) : 0;

  const workplaceType = job.workLocation?.toLowerCase().includes('remote')
    ? 'Remote'
    : (job.workLocation?.toLowerCase().includes('hybrid') ? 'Hybrid' : 'On-site (Office)');

  return {
    // 1. Basic Information
    jobId: String(job._id),
    jobTitle: job.jobTitle || 'N/A',
    designation: job.designation || job.designationId?.name || job.jobTitle || 'N/A',
    company: 'Bharat Organic Expo',
    projectEvent: 'Bharat Organic Expo',
    department: job.departmentId?.name || job.department || 'General',
    jobCode: job.jobCode || job.requisitionId || `JOB-${String(job._id).slice(-6).toUpperCase()}`,
    employmentType: job.employmentType || 'Full Time',
    workplaceType,
    totalOpenings: job.numberOfPositions || 1,
    jobLocation: job.workLocation || job.locationBranchId?.name || job.locationBranchId?.city || 'Ghaziabad / Delhi NCR',
    experienceYears: {
      min: expMin,
      max: expMax,
      text: `${expMin} to ${expMax} Years`
    },
    education: job.qualificationReq || 'Graduate',

    // 2. Compensation
    compensation: {
      monthlyCtc: {
        min: monthlyMin,
        max: monthlyMax,
        formatted: monthlyMin && monthlyMax ? `₹${monthlyMin.toLocaleString('en-IN')} - ₹${monthlyMax.toLocaleString('en-IN')}` : 'Best in Industry'
      },
      annualCtc: {
        min: job.salaryCtcMin || 0,
        max: job.salaryCtcMax || 0,
        formatted: job.salaryCtcMin && job.salaryCtcMax ? `₹${Number(job.salaryCtcMin).toLocaleString('en-IN')} - ₹${Number(job.salaryCtcMax).toLocaleString('en-IN')}` : 'Best in Industry'
      },
      salaryType: 'CTC (Cost to Company)',
      performanceIncentive: true,
      incentiveType: 'Performance Based'
    },

    // 3. Job Description
    jobDescription: {
      theOpportunity: job.jobDescriptionSummary || job.detailedJustification || '',
      keyResponsibilities: Array.isArray(job.keyResponsibilities) ? job.keyResponsibilities.join('\n') : (job.keyResponsibilities || ''),
      whoCanApply: job.whoCanApply || `Candidates with relevant experience in ${job.jobTitle || 'this field'}.`
    },

    // 4. Candidate Requirements
    candidateRequirements: {
      requiredKeySkills: Array.isArray(job.technicalSkills) ? job.technicalSkills : (job.technicalSkills ? [job.technicalSkills] : []),
      preferredSkills: Array.isArray(job.softSkills) ? job.softSkills : (job.softSkills ? [job.softSkills] : []),
      targetIndustrySegments: ['Organic Products', 'Exhibition / Events', 'FMCG'],
      specificExperience: job.experienceReq || ''
    },

    // 5. Additional Settings
    additionalSettings: {
      jobVisibilityOnWebsite: 'Show in Career Page Menu',
      featuredJob: job.priority === 'High' || job.isUrgent === true,
      applicationOpenDate: job.requestDate || job.createdAt,
      applicationClosingDate: job.applicationLastDate || null,
      tags: [job.departmentId?.name || job.department, job.jobTitle, job.workLocation].filter(Boolean)
    },

    // Direct link to apply
    applyUrl: `/careers/apply/${job._id}`,
    createdAt: job.createdAt
  };
}

/**
 * GET /api/v1/careers/bharat-organic/jobs
 * Dedicated API returning only POSTED jobs mapped to Bharat Organic schema.
 */
router.get('/bharat-organic/jobs', async (req: Request, res: Response) => {
  try {
    const { search, location } = req.query;

    // Filter strictly for Posted jobs (or fallback to approved jobs if explicitly requested)
    const filter: any = {
      $or: [
        { recruitmentStatus: 'Posted' },
        { status: 'Approved', publishChannels: { $in: ['Career Portal', 'Website', 'Bharat Organic'] } }
      ]
    };

    if (search && String(search).trim()) {
      filter.jobTitle = { $regex: String(search).trim(), $options: 'i' };
    }

    const jobs = await ManpowerRequest.find(filter)
      .populate('departmentId', 'name')
      .populate('locationBranchId', 'name city state')
      .populate('designationId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    let filtered = jobs;
    if (location && String(location).trim()) {
      const locTerm = String(location).trim().toLowerCase();
      filtered = filtered.filter((job: any) =>
        job.workLocation?.toLowerCase().includes(locTerm) ||
        job.locationBranchId?.name?.toLowerCase().includes(locTerm) ||
        job.locationBranchId?.city?.toLowerCase().includes(locTerm)
      );
    }

    const mappedJobs = filtered.map(mapToBharatOrganic);

    res.status(200).json({
      success: true,
      platform: 'Bharat Organic Expo',
      count: mappedJobs.length,
      data: mappedJobs
    });
  } catch (error: any) {
    console.error('Error fetching Bharat Organic jobs:', error);
    res.status(500).json({ success: false, message: 'Error fetching jobs', error: error.message });
  }
});

/**
 * GET /api/v1/careers/bharat-organic/jobs/:id
 * Get single job mapped for Bharat Organic
 */
router.get('/bharat-organic/jobs/:id', async (req: Request, res: Response) => {
  try {
    const job = await ManpowerRequest.findById(req.params.id)
      .populate('departmentId', 'name')
      .populate('locationBranchId', 'name city state')
      .populate('designationId', 'name')
      .lean();

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    res.status(200).json({
      success: true,
      platform: 'Bharat Organic Expo',
      data: mapToBharatOrganic(job)
    });
  } catch (error: any) {
    console.error('Error fetching single Bharat Organic job:', error);
    res.status(500).json({ success: false, message: 'Error fetching job', error: error.message });
  }
});

/**
 * POST /api/v1/careers/bharat-organic/apply
 * Allows candidates applying on Bharat Organic to be submitted directly into the CRM pipeline.
 */
router.post('/bharat-organic/apply', async (req: Request, res: Response) => {
  try {
    const { Candidate } = require('../models/Candidate');
    const {
      jobId, firstName, lastName, email, phone, resumeUrl,
      currentCTC, expectedCTC, totalExperience, currentLocation, linkedin
    } = req.body;

    if (!firstName || !email) {
      return res.status(400).json({ success: false, message: 'firstName and email are required' });
    }

    let job: any = null;
    if (jobId) {
      job = await ManpowerRequest.findById(jobId).lean();
    }

    const candidate = await Candidate.create({
      tenantId: job?.tenantId || (req as any).tenantId || new (require('mongoose').Types.ObjectId)(),
      firstName,
      lastName: lastName || '.',
      email,
      phone: phone || '',
      jobRole: job?.jobTitle || req.body.jobTitle || 'General Application',
      departmentId: job?.departmentId,
      resumeUrl: resumeUrl || '',
      source: 'Bharat Organic',
      status: 'Applied',
      applicationDetails: {
        currentCTC: currentCTC || '',
        expectedCTC: expectedCTC || '',
        totalExperience: totalExperience || '',
        currentLocation: currentLocation || '',
        linkedin: linkedin || '',
        appliedVia: 'Bharat Organic Website',
        jobId: jobId || ''
      }
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      candidateId: candidate._id
    });
  } catch (error: any) {
    console.error('Error submitting application from Bharat Organic:', error);
    res.status(500).json({ success: false, message: 'Failed to submit application', error: error.message });
  }
});

export default router;
