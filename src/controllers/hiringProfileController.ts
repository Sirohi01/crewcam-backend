import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Candidate } from '../models/Candidate';
import { HiringPipelineState } from '../models/HiringPipelineState';
import { ManpowerRequest } from '../models/ManpowerRequest';
import { Interview } from '../models/Interview';
import { InterviewEvaluation } from '../models/InterviewEvaluation';
import { SelectionApproval } from '../models/SelectionApproval';
import { CTCBreakup } from '../models/CTCBreakup';
import { LetterOfIntent } from '../models/LetterOfIntent';
import { JoiningConfirmation } from '../models/JoiningConfirmation';
import { JoiningForm } from '../models/JoiningForm';

/**
 * Read-only source of truth for pre-filling hiring forms.  It deliberately
 * returns saved records only; the frontend may suggest values but never writes
 * these values back unless the user saves the target form.
 */
export const getCandidateHiringProfile = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const candidateId = String(req.params.candidateId || '');
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const candidate = await Candidate.findOne({ _id: candidateId, tenantId } as any).lean();
    if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

    const state = await HiringPipelineState.findOne({ tenantId, candidateId } as any).lean();
    const manpowerRef = state?.steps?.find((step: any) => step.key === 'manpowerRequest')?.refId;
    const [manpower, interview, evaluation, selectionApproval, ctcBreakup, loi, joiningConfirmation, joiningForm] = await Promise.all([
      manpowerRef ? ManpowerRequest.findOne({ _id: manpowerRef, tenantId })
        .populate('reportingTo', 'firstName lastName employeeCode')
        .populate('locationBranchId', 'name location address city state country')
        .lean() : null,
      Interview.findOne({ tenantId, candidateId } as any).sort({ scheduledAt: -1, createdAt: -1 }).lean(),
      InterviewEvaluation.findOne({ tenantId, candidateId } as any).sort({ createdAt: -1 }).lean(),
      SelectionApproval.findOne({ tenantId, candidateId } as any).sort({ createdAt: -1 }).lean(),
      CTCBreakup.findOne({ tenantId, candidateId } as any).sort({ createdAt: -1 }).lean(),
      LetterOfIntent.findOne({ tenantId, candidateId } as any).sort({ createdAt: -1 }).lean(),
      JoiningConfirmation.findOne({ tenantId, candidateId } as any).sort({ createdAt: -1 }).lean(),
      JoiningForm.findOne({ tenantId, candidateId } as any).sort({ createdAt: -1 }).lean(),
    ]);

    res.json({
      candidate,
      employeeId: state?.employeeId || null,
      manpower,
      interview,
      evaluation,
      selectionApproval,
      ctcBreakup,
      loi,
      joiningConfirmation,
      joiningForm,
    });
  } catch (error: any) {
    console.error('Error building hiring profile:', error);
    res.status(500).json({ message: 'Error loading hiring profile' });
  }
};

export const getCandidateForEmployee = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const employeeId = String(req.params.employeeId || '');
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    const state = await HiringPipelineState.findOne({ tenantId, employeeId } as any).select('candidateId').lean();
    if (!state) return res.status(404).json({ message: 'No hiring candidate is linked to this employee' });
    res.json({ candidateId: String(state.candidateId) });
  } catch (error: any) {
    res.status(500).json({ message: 'Error resolving employee hiring profile' });
  }
};
