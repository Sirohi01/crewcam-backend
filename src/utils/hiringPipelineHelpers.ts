import { Types } from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { HiringPipelineState } from '../models/HiringPipelineState';
import { AuditLog } from '../models/AuditLog';
import { STEP_RULES, StepRule } from './hiringPipelineRules';
import { StepStatus } from '../models/HiringPipelineState';

const APPROVAL_REQUIRED_STEP_KEYS = new Set(
  STEP_RULES.flatMap((rule) => rule.requires.filter((req) => req.status === 'approved').map((req) => req.key))
);

const checklistItemsFor = (rule: StepRule) => [
  { item: 'Required fields submitted', done: false },
  { item: 'Required attachments uploaded', done: false },
  { item: 'Required approval obtained', done: !APPROVAL_REQUIRED_STEP_KEYS.has(rule.key) },
  { item: 'Audit entry recorded', done: false },
];

const blankSteps = () => STEP_RULES.map((r: StepRule) => ({
  stepNumber: r.stepNumber,
  key: r.key,
  status: 'pending' as StepStatus,
  checklist: checklistItemsFor(r),
}));

const RANK: Record<StepStatus, number> = { pending: 0, in_progress: 1, completed: 2, approved: 3, rejected: -1, skipped: -1 };
/** rejected/skipped are terminal overrides (always settable); otherwise never downgrade rank
 *  (e.g. scheduling a 2nd interview after the 1st already completed shouldn't un-complete it). */
const isForwardOrTerminal = (before: StepStatus, after: StepStatus) =>
  after === 'rejected' || after === 'skipped' || RANK[after] >= RANK[before];

/** One HiringPipelineState document per candidate, created lazily on first touch (usually candidate creation). */
export const getOrCreatePipelineState = async (tenantId: string | undefined, candidateId: string | undefined) => {
  if (!tenantId || !candidateId) return null;
  let state = await HiringPipelineState.findOne({ tenantId, candidateId } as any);
  if (!state) {
    state = await HiringPipelineState.create({ tenantId, candidateId, steps: blankSteps(), currentStep: 1 } as any);
  } else {
    let changed = false;
    for (const rule of STEP_RULES) {
      const step = state.steps.find((s) => s.key === rule.key);
      if (step && (!step.checklist || step.checklist.length === 0)) {
        step.checklist = checklistItemsFor(rule) as any;
        changed = true;
      }
    }
    if (changed) await state.save();
  }
  return state;
};

const markChecklistItem = (step: any, item: string, actorId?: any) => {
  const checklistItem = step.checklist?.find((entry: any) => entry.item === item);
  if (!checklistItem || checklistItem.done) return;
  checklistItem.done = true;
  checklistItem.doneAt = new Date();
  if (actorId) checklistItem.doneBy = actorId;
};

/**
 * Writes a step's new status, advances `currentStep` to the highest stepNumber with a real
 * status, and records an AuditLog entry (actor, role, IP, before/after) per the design doc's
 * audit requirement — centralized here so every controller gets it for free instead of each
 * one needing to remember to log a transition separately.
 */
export const advanceStep = async (
  req: AuthRequest,
  tenantId: string | undefined,
  candidateId: string | undefined,
  stepKey: string,
  newStatus: StepStatus,
  refId?: Types.ObjectId | string
) => {
  const state = await getOrCreatePipelineState(tenantId, candidateId);
  if (!state) return null;
  const step = state.steps.find((s) => s.key === stepKey);
  if (!step) return state;

  const before = step.status;
  if (before === newStatus || !isForwardOrTerminal(before, newStatus)) return state;

  step.status = newStatus;
  if (newStatus === 'completed' || newStatus === 'approved') step.completedAt = new Date();
  if (newStatus === 'approved') step.approvedBy = req.user?._id as any;
  if (refId) step.refId = refId as any;

  if (!step.checklist || step.checklist.length === 0) {
    const rule = STEP_RULES.find((r) => r.key === stepKey);
    if (rule) step.checklist = checklistItemsFor(rule) as any;
  }
  markChecklistItem(step, 'Required fields submitted', req.user?._id);
  if (newStatus === 'completed' || newStatus === 'approved') {
    markChecklistItem(step, 'Required attachments uploaded', req.user?._id);
  }
  if (newStatus === 'approved') {
    markChecklistItem(step, 'Required approval obtained', req.user?._id);
  }

  const maxAdvanced = Math.max(
    ...state.steps.filter((s) => s.status !== 'pending').map((s) => s.stepNumber),
    state.currentStep
  );
  state.currentStep = maxAdvanced;

  await state.save();

  await AuditLog.create({
    tenantId,
    userId: req.user?._id as any,
    action: 'HIRING_STEP_TRANSITION',
    module: 'Hiring',
    status: 'SUCCESS',
    ipAddress: req.ip as string,
    userAgent: req.headers['user-agent'] as string,
    details: { candidateId, stepKey, before, after: newStatus, role: (req.user as any)?.roleId },
  } as any);

  markChecklistItem(step, 'Audit entry recorded', req.user?._id);
  await state.save();

  return state;
};

/** Bridges the candidateId-keyed pipeline to the employeeId-keyed final steps (22/23/24), set once
 *  onboarding identifies which User record this candidate became (see createJoiningForm). */
export const linkEmployeeId = async (tenantId: string | undefined, candidateId: string | undefined, employeeId: string | undefined) => {
  if (!tenantId || !candidateId || !employeeId) return;
  await HiringPipelineState.updateOne({ tenantId, candidateId } as any, { employeeId } as any);
};

/** Same as advanceStep, but for the 3 steps (probationReview/performanceEval/idCard) whose
 *  controllers only have an employeeId, not a candidateId, to identify the pipeline by. */
export const advanceStepForEmployee = async (
  req: AuthRequest,
  tenantId: string | undefined,
  employeeId: string | undefined,
  stepKey: string,
  newStatus: StepStatus,
  refId?: Types.ObjectId | string
) => {
  if (!tenantId || !employeeId) return null;
  const state = await HiringPipelineState.findOne({ tenantId, employeeId } as any);
  if (!state) return null;
  return advanceStep(req, tenantId, String(state.candidateId), stepKey, newStatus, refId);
};
