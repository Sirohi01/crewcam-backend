import { Candidate } from '../models/Candidate';
import { ResumeScreening } from '../models/ResumeScreening';

// Per docs/hiring/15_HIRING_DATA_SECURITY_RETENTION.md §4: resume + AI screening text is
// retained for the duration of the requisition plus a buffer for rejected candidates.
// These numbers are defaults — confirm against the company's actual compliance policy
// before production (flagged explicitly in that doc), not before this mechanism exists.
const REJECTED_CANDIDATE_BUFFER_DAYS = 180;
const RETENTION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

/**
 * Structural purge of the most sensitive field (`extractedText`) for rejected candidates
 * past the retention buffer — the fitScore/summary/history stay (useful for hiring-process
 * audits), only the raw resume text is wiped. No cron infra exists in this codebase yet, so
 * this runs as a simple in-process interval; revisit if a real job runner is introduced.
 */
export const purgeExpiredResumeScreeningText = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - REJECTED_CANDIDATE_BUFFER_DAYS * 24 * 60 * 60 * 1000);

  // System-level maintenance job, intentionally cross-tenant (it has to scan every
  // tenant's rejected candidates) — not a per-request handler, so the tenant isolation
  // plugin's bypass is the documented, reviewed exception here, not a request-time leak.
  const rejectedCandidates = await Candidate.find({ status: 'Rejected', updatedAt: { $lte: cutoff } })
    .select('_id tenantId')
    .setOptions({ bypassTenantIsolation: true })
    .lean();
  if (rejectedCandidates.length === 0) return 0;

  const result = await ResumeScreening.updateMany(
    { candidateId: { $in: rejectedCandidates.map((c) => c._id) }, extractedText: { $ne: '' } } as any,
    { $set: { extractedText: '' } },
  ).setOptions({ bypassTenantIsolation: true });
  return result.modifiedCount;
};

export const startRetentionJobs = () => {
  setInterval(() => {
    purgeExpiredResumeScreeningText().catch((err) => console.error('Resume screening retention job failed:', err));
  }, RETENTION_CHECK_INTERVAL_MS);
};
