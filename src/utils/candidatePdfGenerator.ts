import { generatePdfBuffer, PdfLine } from './pdfGenerator';

export interface CandidateHiringPdfData {
  title: string;
  companyName?: string | undefined;
  headerImageUrl?: string | undefined;
  footerNote?: string | undefined;
  recipientName?: string | undefined;
  lines: PdfLine[];
}

/**
 * Candidate-side hiring documents stay isolated from manpower PDFs.
 * Keep this file as the single place for LOI, offer, NDA and appointment PDF layout changes.
 */
export const generateCandidateHiringPdfBuffer = async (data: CandidateHiringPdfData): Promise<Buffer> => {
  return generatePdfBuffer(data);
};
