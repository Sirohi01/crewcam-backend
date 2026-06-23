import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGate, STEP_RULES } from '../utils/hiringPipelineRules';
import { requireStepUnlocked } from '../middleware/hiringGate';
import { HiringPipelineState } from '../models/HiringPipelineState';
import { StepStatus } from '../models/HiringPipelineState';

const blankSteps = () => STEP_RULES.map((r) => ({ key: r.key, status: 'pending' as StepStatus }));

test('a step with no prerequisite (manpowerRequest) is always unlocked', () => {
  const result = evaluateGate(blankSteps(), 'manpowerRequest');
  assert.equal(result.unlocked, true);
});

test('attempting an out-of-order step write returns blocked with correct blockedBy', () => {
  // Nothing has happened yet — step 4 (ctcBreakup) requires step 3 (selectionApproval) approved.
  const result = evaluateGate(blankSteps(), 'ctcBreakup');
  assert.equal(result.unlocked, false);
  assert.deepEqual(result.blockedBy, ['selectionApproval']);
});

test('requireStepUnlocked returns 403 STEP_LOCKED with correct blockedBy for an out-of-order write', async () => {
  const originalFindOne = HiringPipelineState.findOne;
  (HiringPipelineState as any).findOne = () => Promise.resolve(null);

  const req: any = {
    tenantId: 'tenant-1',
    body: { candidateId: 'candidate-1' },
    user: { tenantId: 'tenant-1' },
  };
  const responseBody: any[] = [];
  const res: any = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      responseBody.push(body);
      return this;
    },
  };
  let nextCalled = false;

  try {
    await requireStepUnlocked('ctcBreakup')(req, res, () => {
      nextCalled = true;
    });
  } finally {
    (HiringPipelineState as any).findOne = originalFindOne;
  }

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(responseBody[0], { error: 'STEP_LOCKED', blockedBy: ['selectionApproval'] });
});

test('step 4 requires selectionApproval to be APPROVED, not merely completed', () => {
  const steps = blankSteps();
  const sa = steps.find((s) => s.key === 'selectionApproval')!;
  sa.status = 'completed';
  assert.equal(evaluateGate(steps, 'ctcBreakup').unlocked, false);

  sa.status = 'approved';
  assert.equal(evaluateGate(steps, 'ctcBreakup').unlocked, true);
});

test('step 13 (offerLetter) is blocked if BGV came back rejected, even if CTC and LOI are done', () => {
  const steps = blankSteps();
  steps.find((s) => s.key === 'ctcBreakup')!.status = 'completed';
  steps.find((s) => s.key === 'loi')!.status = 'completed';
  steps.find((s) => s.key === 'bgvRequest')!.status = 'rejected';

  const result = evaluateGate(steps, 'offerLetter');
  assert.equal(result.unlocked, false);
  assert.ok(result.blockedBy.includes('bgvRequest:rejected'));
});

test('step 13 (offerLetter) is unlocked if BGV was never started (no record yet)', () => {
  const steps = blankSteps();
  steps.find((s) => s.key === 'ctcBreakup')!.status = 'completed';
  steps.find((s) => s.key === 'loi')!.status = 'completed';
  // bgvRequest stays 'pending' — table only excludes a failed BGV, doesn't require one to exist.

  assert.equal(evaluateGate(steps, 'offerLetter').unlocked, true);
});

test('step 17 (appointmentLetter) needs NDA + IT policy + conduct all approved', () => {
  const steps = blankSteps();
  steps.find((s) => s.key === 'nda')!.status = 'approved';
  steps.find((s) => s.key === 'itPolicyAcceptance')!.status = 'approved';
  // conductAcceptance still pending
  assert.equal(evaluateGate(steps, 'appointmentLetter').unlocked, false);

  steps.find((s) => s.key === 'conductAcceptance')!.status = 'approved';
  assert.equal(evaluateGate(steps, 'appointmentLetter').unlocked, true);
});

test('unknown step key is always blocked', () => {
  const result = evaluateGate(blankSteps(), 'notARealStep');
  assert.equal(result.unlocked, false);
});

test('full 24-step happy path: walking the steps in the documented order never trips the gate', () => {
  const steps = blankSteps();
  const setStatus = (key: string, status: StepStatus) => {
    steps.find((s) => s.key === key)!.status = status;
  };

  // Mirrors exactly what each controller does on its real-world success path (see
  // hiringPipelineHelpers.ts call sites) — completed/approved per docs/hiring/11... §3.
  const walk: [string, StepStatus][] = [
    ['manpowerRequest', 'completed'],
    ['interview', 'completed'],
    ['interviewEvaluation', 'completed'],
    ['selectionApproval', 'approved'],
    ['ctcBreakup', 'completed'],
    ['loi', 'completed'],
    ['joiningConfirmation', 'completed'],
    ['documentChecklist', 'in_progress'],
    ['bgvRequest', 'completed'],
    ['joiningForm', 'completed'],
    ['nomination', 'completed'],
    ['bankPayrollInfo', 'completed'],
    ['emergencyContact', 'completed'],
    ['offerLetter', 'approved'],
    ['nda', 'approved'],
    ['itPolicyAcceptance', 'approved'],
    ['conductAcceptance', 'approved'],
    ['appointmentLetter', 'completed'],
    ['assetAccessForm', 'completed'],
    ['engagementConfirmation', 'completed'],
    ['induction', 'completed'],
    ['teamIntro', 'completed'],
    ['probationReview', 'completed'],
    ['performanceEval', 'completed'],
    ['idCard', 'completed'],
  ];

  for (const [key] of walk) {
    const result = evaluateGate(steps, key);
    assert.equal(result.unlocked, true, `expected ${key} to be unlocked, blocked by: ${result.blockedBy.join(', ')}`);
    const targetStatus = walk.find((w) => w[0] === key)![1];
    setStatus(key, targetStatus);
  }

  // Every step rule should have been exercised by the walk.
  assert.equal(walk.length, STEP_RULES.length);
});

test('jumping straight to step 17 without doing 14-16 first is blocked', () => {
  const steps = blankSteps();
  steps.find((s) => s.key === 'ctcBreakup')!.status = 'completed';
  steps.find((s) => s.key === 'loi')!.status = 'completed';
  steps.find((s) => s.key === 'offerLetter')!.status = 'approved';
  // NDA/policy/conduct never happened.

  const result = evaluateGate(steps, 'appointmentLetter');
  assert.equal(result.unlocked, false);
  assert.deepEqual(result.blockedBy.sort(), ['conductAcceptance', 'itPolicyAcceptance', 'nda'].sort());
});
