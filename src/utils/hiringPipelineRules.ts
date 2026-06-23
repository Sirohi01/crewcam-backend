import { IPipelineStep, StepStatus } from '../models/HiringPipelineState';

/**
 * Rank order for "at least this status" comparisons. `rejected`/`skipped` are
 * terminal-negative and never satisfy a `requires` check, regardless of rank.
 */
const STATUS_RANK: Record<StepStatus, number> = {
  pending: 0,
  in_progress: 1,
  completed: 2,
  approved: 3,
  rejected: -1,
  skipped: -1,
};

interface StepCondition {
  key: string;
  status: StepStatus;
}

export interface StepRule {
  stepNumber: number;
  key: string;
  label: string;
  /** ALL of these must be satisfied (actual status rank >= required rank) to unlock this step. */
  requires: StepCondition[];
  /** If ANY of these conditions hold, this step is blocked regardless of `requires`. */
  excludes?: StepCondition[];
}

/**
 * The 24-step hiring flow's dependency graph, per docs/hiring/11_SEQUENTIAL_GATING_ENGINE.md §3
 * (confirmed with user as-is, no changes, 2026-06-18). `interview` is a side-channel entry (not
 * one of the user's 24 numbered steps) needed because Step 2's real prerequisite is "at least one
 * completed interview", not "Step 1 done" — Step 1 (manpowerRequest) itself has no prerequisite.
 */
export const STEP_RULES: StepRule[] = [
  { stepNumber: 1, key: 'manpowerRequest', label: 'Manpower Request', requires: [] },
  { stepNumber: 0, key: 'interview', label: 'Interview', requires: [] },
  { stepNumber: 2, key: 'interviewEvaluation', label: 'Interview Evaluation Sheet', requires: [{ key: 'interview', status: 'completed' }] },
  { stepNumber: 3, key: 'selectionApproval', label: 'Selection Approval Note', requires: [{ key: 'interviewEvaluation', status: 'completed' }] },
  { stepNumber: 4, key: 'ctcBreakup', label: 'CTC Breakup', requires: [{ key: 'selectionApproval', status: 'approved' }] },
  { stepNumber: 5, key: 'loi', label: 'Letter of Intent', requires: [{ key: 'ctcBreakup', status: 'completed' }] },
  { stepNumber: 6, key: 'joiningConfirmation', label: 'Joining Confirmation Mail', requires: [{ key: 'loi', status: 'completed' }] },
  { stepNumber: 7, key: 'documentChecklist', label: 'Document Checklist', requires: [{ key: 'joiningConfirmation', status: 'completed' }] },
  { stepNumber: 8, key: 'bgvRequest', label: 'BGV Request Form & Report', requires: [{ key: 'documentChecklist', status: 'in_progress' }] },
  { stepNumber: 9, key: 'joiningForm', label: 'Employee Joining Form', requires: [{ key: 'bgvRequest', status: 'in_progress' }] },
  { stepNumber: 10, key: 'nomination', label: 'Nomination Form', requires: [{ key: 'bgvRequest', status: 'in_progress' }] },
  { stepNumber: 11, key: 'bankPayrollInfo', label: 'Bank & Payroll Information Form', requires: [{ key: 'bgvRequest', status: 'in_progress' }] },
  { stepNumber: 12, key: 'emergencyContact', label: 'Emergency Contact Details Form', requires: [{ key: 'bgvRequest', status: 'in_progress' }] },
  {
    stepNumber: 13, key: 'offerLetter', label: 'Offer Letter',
    requires: [{ key: 'ctcBreakup', status: 'completed' }, { key: 'loi', status: 'completed' }],
    excludes: [{ key: 'bgvRequest', status: 'rejected' }],
  },
  { stepNumber: 14, key: 'nda', label: 'NDA', requires: [{ key: 'offerLetter', status: 'approved' }] },
  { stepNumber: 15, key: 'itPolicyAcceptance', label: 'IT Policy & Acceptance Form', requires: [{ key: 'offerLetter', status: 'approved' }] },
  { stepNumber: 16, key: 'conductAcceptance', label: 'Code of Conduct Acceptance', requires: [{ key: 'offerLetter', status: 'approved' }] },
  {
    stepNumber: 17, key: 'appointmentLetter', label: 'Appointment Letter',
    requires: [
      { key: 'nda', status: 'approved' },
      { key: 'itPolicyAcceptance', status: 'approved' },
      { key: 'conductAcceptance', status: 'approved' },
    ],
  },
  { stepNumber: 18, key: 'assetAccessForm', label: 'IT Assets / Access / Stationery Form', requires: [{ key: 'appointmentLetter', status: 'completed' }] },
  { stepNumber: 19, key: 'engagementConfirmation', label: 'Engagement Confirmation Form', requires: [{ key: 'assetAccessForm', status: 'completed' }] },
  { stepNumber: 20, key: 'induction', label: 'Induction Form', requires: [{ key: 'engagementConfirmation', status: 'completed' }] },
  { stepNumber: 21, key: 'teamIntro', label: 'Team Introduction Note', requires: [{ key: 'induction', status: 'completed' }] },
  { stepNumber: 22, key: 'probationReview', label: 'Probation Review Form', requires: [{ key: 'teamIntro', status: 'completed' }] },
  { stepNumber: 23, key: 'performanceEval', label: 'Employee Performance Evaluation Sheet', requires: [{ key: 'probationReview', status: 'completed' }] },
  { stepNumber: 24, key: 'idCard', label: 'Visiting Card / ID Card', requires: [{ key: 'appointmentLetter', status: 'completed' }] },
];

export const STEP_RULE_BY_KEY: Record<string, StepRule> = Object.fromEntries(STEP_RULES.map((r) => [r.key, r]));

export interface GateResult {
  unlocked: boolean;
  blockedBy: string[];
}

const satisfies = (actual: StepStatus | undefined, required: StepStatus): boolean => {
  if (!actual) return false;
  if (actual === 'rejected' || actual === 'skipped') return false;
  return STATUS_RANK[actual] >= STATUS_RANK[required];
};

/**
 * Pure function: given a candidate's current step states and a target step key, is it unlocked?
 * No DB access here by design — every cross-model fact (e.g. "BGV result was Discrepancy") must
 * already have been written into `steps[]` by the controller that observed it, via advanceStep().
 * This is what keeps the rule table fully unit-testable.
 */
export const evaluateGate = (steps: Pick<IPipelineStep, 'key' | 'status'>[], targetKey: string): GateResult => {
  const rule = STEP_RULE_BY_KEY[targetKey];
  if (!rule) return { unlocked: false, blockedBy: [`unknown step: ${targetKey}`] };

  const statusByKey = new Map(steps.map((s) => [s.key, s.status]));
  const blockedBy: string[] = [];

  for (const cond of rule.requires) {
    if (!satisfies(statusByKey.get(cond.key), cond.status)) {
      blockedBy.push(cond.key);
    }
  }
  for (const cond of rule.excludes || []) {
    if (statusByKey.get(cond.key) === cond.status) {
      blockedBy.push(`${cond.key}:${cond.status}`);
    }
  }

  return { unlocked: blockedBy.length === 0, blockedBy };
};
