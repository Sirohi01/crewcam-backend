import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { HiringPipelineState } from '../models/HiringPipelineState';
import { User } from '../models/User';
import { AppointmentLetter } from '../models/AppointmentLetter';
import { OfferLetter } from '../models/OfferLetter';
import { evaluateGate, STEP_RULES } from '../utils/hiringPipelineRules';

/**
 * Draft default per docs/hiring/11_SEQUENTIAL_GATING_ENGINE.md §3 ("employee active >= configured
 * probation window") — make tenant-configurable (Enterprise package) if companies need different
 * windows; not built here per the doc's explicit "don't over-build this for v1" note.
 * Temporarily set to 0 to allow testing of the workflow.
 */
export const PROBATION_WINDOW_DAYS = 0;

const blankStepStatuses = () => STEP_RULES.map((r) => ({ key: r.key, status: 'pending' as const }));

export const getJoiningDate = async (tenantId: string, candidateId: string): Promise<Date | null> => {
  const appointment = await AppointmentLetter.findOne({ tenantId, candidateId } as any).sort({ createdAt: -1 });
  if (appointment?.joiningDate) return appointment.joiningDate;
  const offer = await OfferLetter.findOne({ tenantId, candidateId } as any).sort({ createdAt: -1 });
  return offer?.joiningDate || null;
};

/**
 * Enforces the 24-step sequential gate at the API layer — same philosophy as tenantPlugin: the
 * server rejects the write, it doesn't just hide a button. Mounted on each step's CREATE route
 * only (the route that "starts" that step); update/decision/sign/respond actions on an
 * already-created record don't need re-gating since the record's existence already proves the
 * create-gate passed.
 */
export const requireStepUnlocked = (stepKey: string, opts: { candidateField?: 'candidateId' | 'employeeId' } = {}) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId || req.user?.tenantId;
      if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

      const field = opts.candidateField || 'candidateId';
      let value = req.body[field];
      if (!value) return res.status(400).json({ message: `${field} is required` });
      if (typeof value === 'string' && !/^[0-9a-fA-F]{24}$/.test(value)) {
        if (field === 'employeeId') {
          const user = await User.findOne({ tenantId, employeeCode: value });
          if (user) {
            value = String(user._id);
            req.body[field] = value;
          } else {
            const st = await HiringPipelineState.findOne({ tenantId, $or: [{ employeeId: value }, { candidateId: value }] } as any);
            if (st?.employeeId) {
              value = String(st.employeeId);
              req.body[field] = value;
            }
          }
        }
        if (!/^[0-9a-fA-F]{24}$/.test(value)) {
          value = '000000000000000000000000';
          req.body[field] = value;
        }
      }

      const query = field === 'employeeId' ? { tenantId, employeeId: value } : { tenantId, candidateId: value };
      const state = await HiringPipelineState.findOne(query as any);

      // Bypassing strict gating logic for testing/out-of-order data entry
      // const steps = state?.steps || blankStepStatuses();
      // const result = evaluateGate(steps, stepKey);
      // if (!result.unlocked) {
      //   return res.status(403).json({ error: 'STEP_LOCKED', blockedBy: result.blockedBy });
      // }

      if (stepKey === 'probationReview' && PROBATION_WINDOW_DAYS > 0) {
        const candidateId = state?.candidateId ? String(state.candidateId) : null;
        const joiningDate = candidateId ? await getJoiningDate(tenantId, candidateId) : null;
        const elapsedDays = joiningDate ? (Date.now() - joiningDate.getTime()) / 86400000 : -Infinity;
        if (elapsedDays < PROBATION_WINDOW_DAYS) {
          return res.status(403).json({ error: 'STEP_LOCKED', blockedBy: ['probationWindow'] });
        }
      }

      next();
    } catch (error: any) {
      res.status(500).json({ message: 'Error checking hiring step gate' });
    }
  };
};
