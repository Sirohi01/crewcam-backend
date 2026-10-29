import axios from 'axios';
import { Integration, IIntegration } from '../models/Integration';
import { ManpowerRequest } from '../models/ManpowerRequest';
import { Candidate } from '../models/Candidate';

/**
 * Pulls job postings (and applied candidates) live from a tenant's own career site(s) and
 * mirrors them into ManpowerRequest / Candidate so they show up in HR-CRM, without HR-CRM and
 * the tenant's site ever sharing a database. Each connected site is just an Integration document
 * with provider "career-site" (baseUrl + jobsPath/applicationsPath/postPath) — the same pattern
 * already used for Slack/WhatsApp/Stripe credentials — so this works for any tenant's site, not
 * only Bharat Organic, and a tenant with MULTIPLE career websites just has multiple such
 * Integration documents (distinguished by their own `siteKey`); every function here loops over
 * all of a tenant's active ones instead of assuming there's exactly one.
 */

/** A connected site's resolved, decrypted config, tagged with the siteKey that distinguishes it
 * from any other site the same tenant has connected (falls back to the integration's _id so two
 * sites never accidentally share a key just because neither set one explicitly). */
interface CareerSite {
  integrationId: string;
  siteKey: string;
  baseUrl: string;
  jobsPath: string;
  applicationsPath: string;
  listPath?: string;
  fieldMap?: string;
  postPath?: string;
  apiKey?: string;
}

async function getActiveCareerSites(tenantId: string): Promise<CareerSite[]> {
  const integrations = await Integration.find({ tenantId, provider: 'career-site', isActive: true } as any);
  const sites: CareerSite[] = [];
  for (const integration of integrations as IIntegration[]) {
    const creds = integration.getDecryptedCredentials();
    if (!creds.baseUrl) continue;
    sites.push({
      integrationId: String(integration._id),
      siteKey: creds.siteKey || String(integration._id),
      baseUrl: creds.baseUrl,
      jobsPath: creds.jobsPath || '/api/careers/jobs',
      applicationsPath: creds.applicationsPath || '/api/careers/integrations/applications',
      listPath: creds.listPath,
      fieldMap: creds.fieldMap,
      postPath: creds.postPath,
      apiKey: creds.apiKey,
    });
  }
  return sites;
}

/** Shape every connected career site's public jobs endpoint is expected to return
 * (the fields Bharat Organic's /api/careers/jobs already serves). A tenant whose
 * site uses different field names configures `fieldMap` on the integration instead
 * of this file needing a tenant-specific branch. */
export interface RemoteJob {
  _id: string;
  title: string;
  designation?: string;
  department: string;
  location: string;
  employmentType?: string;
  workplaceType?: string;
  totalOpenings?: number;
  experienceMin?: number;
  experienceMax?: number;
  // Free-text fallback for sites that only expose one experience string (e.g. "Minimum 1 Years")
  // rather than structured min/max — used when experienceMin/experienceMax aren't present.
  experienceReq?: string;
  educationRequirements?: string;
  ctcMin?: number;
  ctcMax?: number;
  description?: string;
  skills?: string[];
  preferredSkills?: string[];
  responsibilities?: string[];
  requirements?: string[];
  preferredQualifications?: string[];
  jobCode?: string;
  applicationClosingDate?: string;
  featuredJob?: boolean;
  // Left loose (not the strict enum) because many tenant sites only ever list already-open
  // postings and don't send a status at all, or send their own words for it (see STATUS_ALIASES).
  status?: string;
}

const STATUS_ALIASES: Record<string, 'DRAFT' | 'OPEN' | 'CLOSED'> = {
  active: 'OPEN', open: 'OPEN', published: 'OPEN', live: 'OPEN',
  closed: 'CLOSED', inactive: 'CLOSED', expired: 'CLOSED',
  draft: 'DRAFT', pending: 'DRAFT',
};

/** Normalizes a tenant site's own status word into HR-CRM's OPEN/CLOSED/DRAFT. A site with
 * no status field at all (common for endpoints that only ever list currently-open postings,
 * e.g. ".../vacancies/active") defaults to OPEN rather than being dropped. */
function normalizeRemoteStatus(status: string | undefined): 'DRAFT' | 'OPEN' | 'CLOSED' {
  if (!status) return 'OPEN';
  const upper = status.toUpperCase();
  if (upper === 'OPEN' || upper === 'CLOSED' || upper === 'DRAFT') return upper as any;
  return STATUS_ALIASES[status.toLowerCase()] || 'OPEN';
}

/** Reads a (possibly dotted, e.g. "data.vacancies") path out of an arbitrary object. */
function getByPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

/** Remaps one tenant's raw job object onto the RemoteJob shape this file speaks, using the
 * integration's own `fieldMap` (JSON string of {ourField: "their.path"}). Fields the tenant
 * already names the same (e.g. "title", "_id") need no entry — they pass through as-is. This
 * is what lets a site with completely different field names (see Design House's "vacancyCount"
 * instead of "totalOpenings") plug in through config instead of a tenant-specific code branch. */
function applyFieldMap(raw: any, fieldMapJson?: string): RemoteJob {
  if (!fieldMapJson) return raw;
  let fieldMap: Record<string, string>;
  try { fieldMap = JSON.parse(fieldMapJson); } catch { return raw; }
  const mapped: any = { ...raw };
  for (const [ourField, theirPath] of Object.entries(fieldMap)) {
    mapped[ourField] = getByPath(raw, theirPath);
  }
  return mapped;
}

export function mapRemoteJobToManpowerRequest(tenantId: string, job: RemoteJob, siteKey?: string) {
  const experienceReq =
    job.experienceMin != null && job.experienceMax != null
      ? `${job.experienceMin}-${job.experienceMax} Years`
      : job.experienceReq;

  const normalizedStatus = normalizeRemoteStatus(job.status);
  const recruitmentStatus = normalizedStatus === 'OPEN' ? 'Posted' : normalizedStatus === 'CLOSED' ? 'Closed' : 'Draft';

  return {
    tenantId,
    sourceSystem: 'career-site' as const,
    externalJobId: String(job._id),
    sourceSite: siteKey,
    lastSyncedAt: new Date(),

    jobTitle: job.title,
    designation: job.designation,
    workLocation: job.location,
    employmentType: job.employmentType || 'Full-time',
    numberOfPositions: job.totalOpenings || 1,
    experienceReq,
    qualificationReq: job.educationRequirements,
    salaryCtcMin: job.ctcMin,
    salaryCtcMax: job.ctcMax,
    jobDescriptionSummary: job.description,
    technicalSkills: job.skills || [],
    softSkills: job.preferredSkills || [],
    keyResponsibilities: job.responsibilities || [],
    whoCanApply: (job.requirements || []).join('\n'),
    preferredQualifications: job.preferredQualifications || [],
    jobCode: job.jobCode,
    applicationLastDate: job.applicationClosingDate ? new Date(job.applicationClosingDate) : undefined,
    isUrgent: Boolean(job.featuredJob),
    priority: job.featuredJob ? 'High' : 'Medium',
    publishChannels: ['Career Portal', 'Website'],
    recruitmentStatus,
    status: 'Approved' as const,
    reasonForHiring: 'New Position',
  };
}

/** Inverse of mapRemoteJobToManpowerRequest — turns a job authored in HR-CRM back into
 * the same RemoteJob shape, so the outbound push (postJobToCareerSite) and the inbound
 * pull (syncCareerSiteJobs) speak one contract. Any tenant's career site that implements
 * both ends of this one shape works, without this file needing a tenant-specific branch. */
function mapManpowerRequestToRemoteJob(request: any): RemoteJob {
  const match = String(request.experienceReq || '').match(/(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/);

  return {
    _id: String(request._id),
    title: request.jobTitle,
    designation: request.designation,
    department: request.departmentId?.name || '',
    location: request.workLocation || '',
    employmentType: request.employmentType,
    workplaceType: request.workMode,
    totalOpenings: request.numberOfPositions,
    experienceMin: match ? Number(match[1]) : undefined,
    experienceMax: match ? Number(match[2]) : undefined,
    experienceReq: !match ? (request.experienceReq || undefined) : undefined,
    educationRequirements: request.qualificationReq,
    ctcMin: request.salaryCtcMin,
    ctcMax: request.salaryCtcMax,
    description: request.jobDescriptionSummary,
    skills: request.technicalSkills || [],
    preferredSkills: request.softSkills || [],
    responsibilities: request.keyResponsibilities || [],
    requirements: request.whoCanApply ? [request.whoCanApply] : [],
    preferredQualifications: request.preferredQualifications || [],
    jobCode: request.jobCode,
    applicationClosingDate: request.applicationLastDate ? new Date(request.applicationLastDate).toISOString() : undefined,
    featuredJob: Boolean(request.isUrgent),
    status: request.status === 'Approved' ? 'OPEN' : request.status === 'Rejected' ? 'CLOSED' : 'DRAFT',
  };
}

export interface CareerSitePostResult {
  success: boolean;
  externalId?: string;
  error?: string;
  skipped?: boolean;
  siteKey?: string;
}

export interface CareerSitesPostResult {
  success: boolean;
  skipped?: boolean;
  sites: CareerSitePostResult[];
}

/** Pushes a job authored in HR-CRM out to EVERY one of the tenant's connected career sites
 * that has a postPath configured (a tenant with multiple websites gets the job pushed to all
 * of them), mirroring syncCareerSiteJobs's pull direction. POSTs to `{baseUrl}{postPath}`.
 *
 * postPath must be explicitly configured per site — it is NOT guessed from jobsPath. The GET
 * listing path and the POST create path turned out, for every real tenant site tested so far
 * (Bharat Organic, Design House), to NOT be the same endpoint; guessing jobsPath as postPath
 * just produced a confusing "publishing failed" for a push nobody had actually set up yet. A
 * tenant with no career-site integration at all, or none with postPath filled in, gets back
 * `{ success: true, skipped: true, sites: [] }` — so job creation is unaffected and this never
 * shows as a false failure. */
export async function postJobToCareerSites(tenantId: string, request: any): Promise<CareerSitesPostResult> {
  const sites = (await getActiveCareerSites(tenantId)).filter((s) => s.postPath);
  if (sites.length === 0) return { success: true, skipped: true, sites: [] };

  const payload = mapManpowerRequestToRemoteJob(request);
  const results: CareerSitePostResult[] = await Promise.all(
    sites.map(async (site): Promise<CareerSitePostResult> => {
      // Most sites that accept a job creation call need something to prove the caller is
      // trusted (not just anyone on the internet) — this site's own API key goes out as
      // x-api-key, same header name regardless of which site is on the other end.
      const headers = site.apiKey ? { 'x-api-key': site.apiKey } : undefined;
      try {
        const { data } = await axios.post(`${site.baseUrl}${site.postPath}`, payload, { timeout: 15000, headers });
        return { success: true, externalId: data?.data?._id || data?._id || payload._id, siteKey: site.siteKey };
      } catch (error: any) {
        console.error(`[careerSiteSync] Failed to post job to ${site.baseUrl}${site.postPath}:`, error?.response?.data || error.message);
        return {
          success: false,
          siteKey: site.siteKey,
          error: error?.response?.data?.message || error.message || 'Failed to post job to career site',
        };
      }
    })
  );

  return { success: results.every((r) => r.success), sites: results };
}

/** Turns a company's "Website" field (e.g. "example.com", "www.example.com",
 * "https://example.com/") into the base URL the "career-site" integration needs
 * (protocol present, no trailing slash) so it can be used as-is for `${baseUrl}${jobsPath}`. */
export function normalizeWebsiteBaseUrl(website: string): string | null {
  const trimmed = website.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export interface CareerSiteSyncResult {
  tenantId: string;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  sites?: number;
}

/** Fetches `{baseUrl}{jobsPath}` for EVERY one of the tenant's active "career-site"
 * integrations and upserts each job into ManpowerRequest, matched on (tenantId, sourceSite,
 * externalJobId) so re-running this is always safe, and so a tenant with several connected
 * websites gets jobs pulled in from all of them in one call. */
export async function syncCareerSiteJobs(tenantId: string): Promise<CareerSiteSyncResult> {
  const sites = await getActiveCareerSites(tenantId);
  if (sites.length === 0) {
    throw new Error(`No active "career-site" integration configured for tenant ${tenantId}`);
  }

  let fetched = 0, created = 0, updated = 0, skipped = 0;
  for (const site of sites) {
    const { data } = await axios.get(`${site.baseUrl}${site.jobsPath}`, { timeout: 15000 });
    // listPath defaults to "data" (Bharat Organic's shape: { data: [...] }); a tenant whose API
    // nests the array elsewhere (e.g. Design House's { vacancies: [...] }) sets listPath instead
    // of this file needing a tenant-specific branch.
    const rawList = getByPath(data, site.listPath || 'data');
    const jobs: RemoteJob[] = Array.isArray(rawList) ? rawList.map((raw: any) => applyFieldMap(raw, site.fieldMap)) : [];
    fetched += jobs.length;

    for (const job of jobs) {
      if (!job._id || !job.title) { skipped++; continue; }

      const result = await ManpowerRequest.findOneAndUpdate(
        { tenantId, sourceSite: site.siteKey, externalJobId: String(job._id) } as any,
        { $set: mapRemoteJobToManpowerRequest(tenantId, job, site.siteKey) },
        { upsert: true, new: false, setDefaultsOnInsert: true } as any
      );
      if (result) updated++; else created++;
    }
  }

  return { tenantId, fetched, created, updated, skipped, sites: sites.length };
}

/** Shape every connected career site's applications-pull endpoint is expected to return (the
 * fields Bharat Organic's /api/careers/integrations/applications already serves) — an applied
 * candidate plus their resume, so HR-CRM can start recruitment without re-keying anything. */
export interface RemoteApplication {
  _id: string;
  applicationId?: string;
  jobId: string;
  jobTitle: string;
  status?: string;
  submittedAt?: string;
  matchScore?: number;
  candidate: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    resumeUrl?: string;
    resumeFileName?: string;
    skills?: string[];
    education?: string[];
    experience?: string[];
    currentCompany?: string;
    currentDesignation?: string;
    totalExperience?: string;
    noticePeriod?: string;
    currentCTC?: string;
    expectedCTC?: string;
    linkedin?: string;
  };
}

const APPLICATION_STATUS_TO_CANDIDATE_STATUS: Record<string, string> = {
  SUBMITTED: 'Applied',
  UNDER_REVIEW: 'Screening',
  SHORTLISTED: 'SHORTLISTED',
  INTERVIEW: 'INTERVIEW_SCHEDULED',
  SELECTED: 'Offered',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Rejected',
};

function mapRemoteApplicationToCandidate(tenantId: string, siteKey: string, app: RemoteApplication) {
  const name = (app.candidate.name || '').trim();
  const [firstName, ...rest] = name ? name.split(/\s+/) : ['Candidate'];

  return {
    tenantId,
    externalApplicationId: String(app._id),
    externalJobId: app.jobId ? String(app.jobId) : undefined,
    sourceSite: siteKey,
    firstName: firstName || 'Candidate',
    lastName: rest.join(' ') || '-',
    email: app.candidate.email || '',
    phone: app.candidate.phone || '',
    jobRole: app.jobTitle || '',
    resumeUrl: app.candidate.resumeUrl,
    resumeUpdatedAt: new Date(),
    source: 'Career Website',
    status: APPLICATION_STATUS_TO_CANDIDATE_STATUS[String(app.status).toUpperCase()] || 'Applied',
    applicationDetails: {
      applicationId: app.applicationId,
      submittedAt: app.submittedAt,
      matchScore: app.matchScore,
      location: app.candidate.location,
      skills: app.candidate.skills,
      education: app.candidate.education,
      experience: app.candidate.experience,
      currentCompany: app.candidate.currentCompany,
      currentDesignation: app.candidate.currentDesignation,
      totalExperience: app.candidate.totalExperience,
      noticePeriod: app.candidate.noticePeriod,
      currentCTC: app.candidate.currentCTC,
      expectedCTC: app.candidate.expectedCTC,
      linkedin: app.candidate.linkedin,
      appliedVia: 'Career Website',
      siteKey,
    },
  };
}

export interface CareerSiteApplicantSyncResult {
  tenantId: string;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  sites?: number;
}

/** Fetches `{baseUrl}{applicationsPath}` for EVERY one of the tenant's active "career-site"
 * integrations and upserts each applied candidate + resume into Candidate, matched on
 * (tenantId, externalApplicationId) so re-running this is always safe, and a tenant with several
 * connected websites gets applicants pulled in from all of them in one call. API-key
 * authenticated the same way the job push is (x-api-key), since the endpoint on the other end
 * isn't behind a human login either. */
export async function syncCareerSiteApplicants(tenantId: string): Promise<CareerSiteApplicantSyncResult> {
  const sites = await getActiveCareerSites(tenantId);
  if (sites.length === 0) {
    throw new Error(`No active "career-site" integration configured for tenant ${tenantId}`);
  }

  let fetched = 0, created = 0, updated = 0, skipped = 0;
  for (const site of sites) {
    const headers = site.apiKey ? { 'x-api-key': site.apiKey } : undefined;
    const { data } = await axios.get(`${site.baseUrl}${site.applicationsPath}`, { timeout: 15000, headers });
    const rawList = getByPath(data, site.listPath || 'data');
    const applications: RemoteApplication[] = Array.isArray(rawList) ? rawList : [];
    fetched += applications.length;

    for (const app of applications) {
      if (!app._id || !app.candidate?.email) { skipped++; continue; }

      const result = await Candidate.findOneAndUpdate(
        { tenantId, externalApplicationId: String(app._id) } as any,
        { $set: mapRemoteApplicationToCandidate(tenantId, site.siteKey, app) },
        { upsert: true, new: false, setDefaultsOnInsert: true } as any
      );
      if (result) updated++; else created++;
    }
  }

  return { tenantId, fetched, created, updated, skipped, sites: sites.length };
}
