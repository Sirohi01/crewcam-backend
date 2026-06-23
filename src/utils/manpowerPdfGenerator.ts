import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export interface ManpowerRequisitionPdfData {
  companyName?: string | undefined;
  headerImageUrl?: string | undefined;
  footerNote?: string | undefined;
  department?: string;
  requestDate?: string;
  requestedBy?: string;
  designation?: string;
  jobTitle?: string;
  position?: string;
  employmentType?: string;
  reportingTo?: string;
  locationOfPosting?: string;
  reasonForHiring?: string;
  replacementName?: string;
  detailedJustification?: string;
  jobDescriptionSummary?: string;
  kraReport?: string;
  salaryCtcMin?: string;
  salaryCtcMax?: string;
  budgetApprovedBy?: string;
  benefits?: string[];
  otherBenefits?: string;
  requiredJoiningDate?: string;
  isUrgent?: string;
  requestReceivedOn?: string;
  approvedBy?: string;
  recruitmentStartDate?: string;
  recruitmentStatus?: string;
  departmentHeadSignature?: string;
  hrHeadSignature?: string;
  directorApprovalSignature?: string;
}

const loadHeaderImage = async (imageUrl?: string): Promise<Buffer | null> => {
  if (!imageUrl) return null;
  try {
    const parsed = new URL(imageUrl, 'http://local');
    if (parsed.pathname.startsWith('/uploads/')) {
      return fs.promises.readFile(path.join(process.cwd(), 'public', parsed.pathname));
    }
    if (parsed.protocol === 'https:' && parsed.hostname === 'res.cloudinary.com') {
      const response = await fetch(imageUrl);
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    }
  } catch {
    return null;
  }
  return null;
};

const stripHtml = (value?: string) => (value || '')
  .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  .replace(/<\/(p|div|li|br|h[1-6])>/gi, '\n')
  .replace(/<li[^>]*>/gi, '- ')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const splitBullets = (value?: string) => {
  const clean = stripHtml(value);
  if (!clean) return [];
  const lines = clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.some((line) => line.startsWith('-') || line.startsWith('•'))) {
    return lines.map((line) => line.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
  }
  return clean.split(/[;\n]/).map((line) => line.trim()).filter(Boolean);
};

export const generateManpowerRequisitionPdfBuffer = async (data: ManpowerRequisitionPdfData): Promise<Buffer> => {
  const headerImage = await loadHeaderImage(data.headerImageUrl);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 24, bufferPages: true });
    const chunks: Buffer[] = [];
    const left = 24;
    const right = 571;
    const contentWidth = right - left;
    const labelWidth = 86;
    const gap = 28;
    const colWidth = (contentWidth - gap) / 2;
    const blue = '#0d3c68';
    const orange = '#f97316';
    const line = '#475569';
    const lightLine = '#cbd5e1';

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fit = (value?: string) => value?.trim() || ' ';
    const formatMoney = (value?: string) => value ? `₹ ${value}` : '';

    const drawHeader = () => {
      doc.y = 22;
      if (headerImage) {
        doc.image(headerImage, left, 20, { fit: [contentWidth, 72], align: 'center', valign: 'center' });
        doc.y = 96;
      } else {
        doc.font('Helvetica-Bold').fontSize(18).fillColor(blue).text(data.companyName || 'CREWCAM', left, 26, { width: contentWidth, align: 'center' });
        doc.y = 56;
      }
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(orange).text('MANPOWER REQUISITION FORM', left, doc.y);
      doc.font('Helvetica-Oblique').fontSize(6.6).fillColor('#111827').text('(For Internal Use - HR & Recruitment Department)', left, doc.y - 9.5, { width: contentWidth, align: 'right' });
      doc.moveTo(left, doc.y + 3).lineTo(right, doc.y + 3).lineWidth(1.1).strokeColor(line).stroke();
      doc.y += 9;
    };

    const ensure = (height: number) => {
      if (doc.y + height > 770) {
        doc.addPage();
        drawHeader();
      }
    };

    const divider = () => {
      doc.moveTo(left, doc.y + 4).lineTo(right, doc.y + 4).lineWidth(1.05).strokeColor(line).stroke();
      doc.y += 11;
    };

    const sectionTitle = (title: string) => {
      ensure(26);
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a').text(title.toUpperCase(), left, doc.y, { characterSpacing: 0.25 });
      doc.y += 12;
    };

    const inlineField = (x: number, y: number, label: string, value?: string, width = colWidth, customLabelWidth = labelWidth) => {
      doc.font('Helvetica-Bold').fontSize(6.8).fillColor('#0f172a').text(label, x, y, { width: customLabelWidth });
      doc.text(':', x + customLabelWidth + 2, y, { width: 6 });
      const valueX = x + customLabelWidth + 10;
      const valueWidth = width - customLabelWidth - 10;
      doc.moveTo(valueX, y + 10).lineTo(x + width, y + 10).lineWidth(0.45).strokeColor(lightLine).stroke();
      doc.font('Helvetica').fontSize(6.9).fillColor('#0f172a').text(fit(value), valueX + 4, y - 0.5, { width: valueWidth - 6, height: 10, ellipsis: true });
    };

    const row = (leftField: [string, string | undefined, number?], rightField?: [string, string | undefined, number?]) => {
      ensure(18);
      const y = doc.y;
      inlineField(left, y, leftField[0], leftField[1], colWidth, leftField[2] || labelWidth);
      if (rightField) inlineField(left + colWidth + gap, y, rightField[0], rightField[1], colWidth, rightField[2] || labelWidth);
      doc.y += 16;
    };

    const paragraphBlock = (label: string, value?: string, labelW = 138) => {
      const clean = stripHtml(value);
      const textWidth = contentWidth - labelW - 14;
      const h = Math.max(26, doc.heightOfString(clean || ' ', { width: textWidth, align: 'justify' }) + 4);
      ensure(h + 4);
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(6.8).fillColor('#0f172a').text(label, left, y, { width: labelW });
      doc.text(':', left + labelW + 2, y, { width: 6 });
      doc.font('Helvetica').fontSize(6.9).fillColor('#0f172a').text(clean || ' ', left + labelW + 14, y - 0.5, { width: textWidth, align: 'justify', lineGap: 1.1 });
      doc.y = y + h;
    };

    const bulletSection = (value?: string) => {
      const bullets = splitBullets(value);
      const fallbackText = stripHtml(value);
      if (!bullets.length && fallbackText) {
        doc.font('Helvetica').fontSize(6.9).fillColor('#0f172a').text(fallbackText, left + 4, doc.y, { width: contentWidth - 8, align: 'justify', lineGap: 1.1 });
        doc.y += 4;
        return;
      }

      const colGap = 22;
      const bulletWidth = (contentWidth - colGap) / 2;
      const startY = doc.y;
      let y1 = startY;
      let y2 = startY;

      bullets.forEach((item, index) => {
        const isLeftCol = index % 2 === 0;
        const x = isLeftCol ? left + 4 : left + bulletWidth + colGap + 4;
        const y = isLeftCol ? y1 : y2;
        ensure(14);
        doc.font('Helvetica-Bold').fontSize(7).fillColor('#111827').text('•', x, y, { width: 6 });
        doc.font('Helvetica').fontSize(6.9).fillColor('#0f172a').text(item, x + 9, y, { width: bulletWidth - 9, lineGap: 0.5 });
        const used = Math.max(10, doc.heightOfString(item, { width: bulletWidth - 9 }) + 2);
        if (isLeftCol) y1 += used; else y2 += used;
      });

      doc.y = Math.max(y1, y2, startY + 22);
    };

    const benefitBox = (x: number, y: number, label: string, selected: boolean) => {
      doc.rect(x, y + 1, 7, 7).lineWidth(0.6).strokeColor(line).stroke();
      if (selected) {
        doc.font('Helvetica-Bold').fontSize(6).fillColor(blue).text('✓', x + 1, y - 0.5, { width: 7, align: 'center' });
      }
      doc.font('Helvetica-Bold').fontSize(6.6).fillColor('#0f172a').text(label, x + 10, y, { width: 76 });
    };

    drawHeader();

    sectionTitle('1. Department Details');
    row(['Department', data.department], ['Date of Request', data.requestDate]);
    row(['Requested By', data.requestedBy], ['Designation', data.designation]);
    divider();

    sectionTitle('2. Position Details');
    row(['Job Title', data.jobTitle], ['Position', data.position]);
    row(['Employment Type', data.employmentType], ['Reporting To', data.reportingTo]);
    row(['Location of Posting', data.locationOfPosting]);
    divider();

    sectionTitle('3. Reason for Hiring');
    row(['Reason', data.reasonForHiring], ['If Replacement, Prev. Employee', data.replacementName, 128]);
    paragraphBlock('Detailed Justification (Mandatory)', data.detailedJustification, 138);
    divider();

    sectionTitle('4. Job Description Summary');
    bulletSection(data.jobDescriptionSummary);
    divider();

    sectionTitle('5. KRA Report');
    bulletSection(data.kraReport);
    divider();

    sectionTitle('6. Compensation Details');
    ensure(38);
    const salaryY = doc.y;
    doc.font('Helvetica-Bold').fontSize(6.8).fillColor('#0f172a').text('Salary Range (CTC)', left, salaryY, { width: labelWidth });
    doc.text(':', left + labelWidth + 2, salaryY);
    doc.font('Helvetica-Bold').fontSize(6.8).text(formatMoney(data.salaryCtcMin), left + labelWidth + 12, salaryY, { width: 72 });
    doc.moveTo(left + labelWidth + 12, salaryY + 10).lineTo(left + labelWidth + 82, salaryY + 10).lineWidth(0.45).strokeColor(lightLine).stroke();
    doc.text('to', left + labelWidth + 88, salaryY, { width: 14 });
    doc.font('Helvetica-Bold').fontSize(6.8).text(formatMoney(data.salaryCtcMax), left + labelWidth + 105, salaryY, { width: 72 });
    doc.moveTo(left + labelWidth + 105, salaryY + 10).lineTo(left + labelWidth + 175, salaryY + 10).lineWidth(0.45).strokeColor(lightLine).stroke();
    inlineField(left + colWidth + gap, salaryY, 'Budget Approved By', data.budgetApprovedBy);
    doc.y += 16;

    const benefits = data.benefits || [];
    doc.font('Helvetica-Bold').fontSize(6.8).fillColor('#0f172a').text('Other Benefits (if any)', left, doc.y, { width: labelWidth });
    doc.text(':', left + labelWidth + 2, doc.y);
    let bx = left + labelWidth + 12;
    ['PF', 'Travel Allowance', 'ESIC', 'Accommodation', 'Incentives'].forEach((benefit) => {
      benefitBox(bx, doc.y - 1, benefit, benefits.includes(benefit));
      bx += benefit === 'Travel Allowance' ? 88 : 72;
    });
    benefitBox(bx, doc.y - 1, 'Other', benefits.includes('Other'));
    doc.moveTo(bx + 48, doc.y + 9).lineTo(right, doc.y + 9).lineWidth(0.45).strokeColor(lightLine).stroke();
    doc.font('Helvetica').fontSize(6.8).text(data.otherBenefits || ' ', bx + 50, doc.y - 0.5, { width: right - bx - 52, ellipsis: true });
    doc.y += 20;
    divider();

    sectionTitle('7. Hiring Timeline');
    row(['Expected Joining Date', data.requiredJoiningDate], ['Is this position urgent ?', data.isUrgent]);
    divider();

    sectionTitle('8. HR Use Only');
    row(['Request Received On', data.requestReceivedOn], ['Approved By', data.approvedBy]);
    row(['Recruitment Start Date', data.recruitmentStartDate], ['Recruitment Status', data.recruitmentStatus]);
    divider();

    sectionTitle('9. Declaration');
    doc.font('Helvetica-Oblique').fontSize(6.8).fillColor('#475569').text('I confirm that the above manpower requirement is essential for operational / project needs and budget provision has been considered.', left, doc.y, { width: contentWidth, align: 'justify' });
    doc.y += 20;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a').text('SIGNATURE', left, doc.y);
    doc.y += 16;
    const sigW = (contentWidth - 46) / 3;
    inlineField(left, doc.y, 'Department Head', data.departmentHeadSignature, sigW, 78);
    inlineField(left + sigW + 23, doc.y, 'HR Head', data.hrHeadSignature, sigW, 48);
    inlineField(left + (sigW + 23) * 2, doc.y, 'Director Approval', data.directorApprovalSignature, sigW, 76);
    doc.y += 20;

    if (data.footerNote) {
      doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text(data.footerNote, left, Math.min(doc.y + 4, 760), { width: contentWidth - 70 });
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#64748b').text(`Page ${i + 1} / ${range.count}`, left, 780, { width: contentWidth, align: 'right' });
    }

    doc.end();
  });
};
