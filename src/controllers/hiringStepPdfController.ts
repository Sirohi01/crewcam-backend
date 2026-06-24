import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getCompanyDocumentBranding } from '../utils/companyDocumentBranding';
import { generatePdfBuffer, savePdfToCloudinary, PdfLine } from '../utils/pdfGenerator';
import { HiringGeneratedPdf } from '../models/HiringGeneratedPdf';
import { InterviewEvaluation } from '../models/InterviewEvaluation';
import { SelectionApproval } from '../models/SelectionApproval';
import { CTCBreakup } from '../models/CTCBreakup';
import { JoiningConfirmation } from '../models/JoiningConfirmation';
import { DocumentChecklist } from '../models/DocumentChecklist';
import { BGVRequest } from '../models/BGVRequest';
import { EmergencyContact } from '../models/EmergencyContact';
import { AssetAccessForm } from '../models/AssetAccessForm';
import { EngagementConfirmation } from '../models/EngagementConfirmation';
import { InductionForm } from '../models/InductionForm';
import { TeamIntro } from '../models/TeamIntro';
import { ProbationReview } from '../models/ProbationReview';
import { HiringPerformanceEval } from '../models/HiringPerformanceEval';

const entries = (value: any, prefix = ''): PdfLine[] => {
  if (value === null || value === undefined || value === '') return [];
  if (value instanceof Date) return [{ label: prefix, value: value.toDateString() }];
  if (Array.isArray(value)) return value.flatMap((row, index) => entries(row, `${prefix || 'Item'} ${index + 1}`));
  if (typeof value === 'object') return Object.entries(value)
    .filter(([key]) => !['_id', '__v', 'tenantId', 'passwordHash'].includes(key))
    .flatMap(([key, child]) => entries(child, prefix ? `${prefix} · ${key}` : key));
  const label = prefix || 'Value';
  const text = /aadhaar|accountnumber|pan/i.test(label) ? `••••${String(value).slice(-4)}` : String(value);
  return [{ label, value: text }];
};

const createPdf = (recordType: string, title: string, Model: any) => async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    const record = await Model.findOne({ _id: id, tenantId } as any).lean();
    if (!record) return res.status(404).json({ message: `${title} record not found` });
    const branding = await getCompanyDocumentBranding(tenantId);
    const buffer = await generatePdfBuffer({ ...branding, title, lines: entries(record), footerNote: branding.footerNote });
    const pdfUrl = await savePdfToCloudinary(buffer, `${recordType}-${id}.pdf`);
    await HiringGeneratedPdf.findOneAndUpdate(
      { tenantId, recordType, recordId: id } as any,
      { tenantId, recordType, recordId: id, pdfUrl },
      { upsert: true, returnDocument: 'after' }
    );
    res.json({ pdfUrl });
  } catch (error: any) {
    console.error(`Error generating ${recordType} PDF:`, error);
    res.status(500).json({ message: `Error generating ${recordType} PDF` });
  }
};

export const generateInterviewEvaluationPdf = createPdf('interview-evaluation', 'Interview Evaluation Sheet', InterviewEvaluation);
export const generateSelectionApprovalPdf = createPdf('selection-approval', 'Selection Approval Note', SelectionApproval);
export const generateCTCBreakupPdf = createPdf('ctc-breakup', 'CTC Breakup', CTCBreakup);
export const generateJoiningConfirmationPdf = createPdf('joining-confirmation', 'Joining Confirmation', JoiningConfirmation);
export const generateDocumentChecklistPdf = createPdf('document-checklist', 'Document Checklist', DocumentChecklist);
export const generateBGVPdf = createPdf('bgv', 'Background Verification', BGVRequest);
export const generateEmergencyContactPdf = createPdf('emergency-contact', 'Emergency Contact Details', EmergencyContact);
export const generateAssetAccessPdf = createPdf('asset-access', 'IT Assets, Access & Stationery', AssetAccessForm);
export const generateEngagementPdf = createPdf('engagement-confirmation', 'Engagement Confirmation', EngagementConfirmation);
export const generateInductionPdf = createPdf('induction', 'Induction Form', InductionForm);
export const generateTeamIntroPdf = createPdf('team-intro', 'Team Introduction Note', TeamIntro);
export const generateProbationPdf = createPdf('probation-review', 'Probation Review', ProbationReview);
export const generatePerformancePdf = createPdf('performance-evaluation', 'Employee Performance Evaluation', HiringPerformanceEval);
