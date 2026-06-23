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
    const doc = new PDFDocument({ size: 'A4', margin: 22, bufferPages: true });
    const chunks: Buffer[] = [];
    const left = 22;
    const right = 573;
    const contentWidth = right - left;
    const labelWidth = 82;
    const gap = 24;
    const colWidth = (contentWidth - gap) / 2;
    const blue = '#0d3c68';
    const orange = '#f97316';
    const line = '#475569';
    const lightLine = '#cbd5e1';

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fit = (value?: string) => value?.trim() || ' ';
    const formatMoney = (value?: string) => value ? `Rs. ${value}` : '';

    const drawFirstPageHeader = () => {
      doc.y = 18;
      if (headerImage) {
        doc.image(headerImage, left, 18, { width: contentWidth, height: 62 });
        doc.y = 84;
      } else {
        doc.font('Helvetica-Bold').fontSize(16).fillColor(blue).text(data.companyName || 'CREWCAM', left, 24, { width: contentWidth, align: 'center' });
        doc.y = 52;
      }
      const titleY = doc.y;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(orange).text('MANPOWER REQUISITION FORM', left, titleY, { width: contentWidth / 2 });
      doc.font('Helvetica-Oblique').fontSize(6).fillColor('#111827').text('(For Internal Use - HR & Recruitment Department)', left + contentWidth / 2, titleY + 1, { width: contentWidth / 2, align: 'right' });
      doc.moveTo(left, titleY + 11).lineTo(right, titleY + 11).lineWidth(1).strokeColor(line).stroke();
      doc.y = titleY + 16;
    };

    const ensure = (height: number) => {
      if (doc.y + height > 777) {
        doc.addPage();
        // Header intentionally appears only on page 1.
        doc.y = 22;
      }
    };

    const divider = () => {
      doc.moveTo(left, doc.y + 2.5).lineTo(right, doc.y + 2.5).lineWidth(0.85).strokeColor(line).stroke();
      doc.y += 7;
    };

    const sectionTitle = (title: string) => {
      ensure(16);
      doc.font('Helvetica-Bold').fontSize(7.2).fillColor('#0f172a').text(title.toUpperCase(), left, doc.y, { characterSpacing: 0.15 });
      doc.y += 8.8;
    };

    const inlineField = (x: number, y: number, label: string, value?: string, width = colWidth, customLabelWidth = labelWidth) => {
      doc.font('Helvetica-Bold').fontSize(6.15).fillColor('#0f172a').text(label, x, y, { width: customLabelWidth });
      doc.text(':', x + customLabelWidth + 2, y, { width: 6 });
      const valueX = x + customLabelWidth + 10;
      const valueWidth = width - customLabelWidth - 10;
      doc.moveTo(valueX, y + 8.5).lineTo(x + width, y + 8.5).lineWidth(0.38).strokeColor(lightLine).stroke();
      doc.font('Helvetica').fontSize(6.15).fillColor('#0f172a').text(fit(value), valueX + 3, y - 0.4, { width: valueWidth - 5, height: 8.5, ellipsis: true });
    };

    const row = (leftField: [string, string | undefined, number?], rightField?: [string, string | undefined, number?]) => {
      ensure(12);
      const y = doc.y;
      inlineField(left, y, leftField[0], leftField[1], colWidth, leftField[2] || labelWidth);
      if (rightField) inlineField(left + colWidth + gap, y, rightField[0], rightField[1], colWidth, rightField[2] || labelWidth);
      doc.y += 11.5;
    };

    const paragraphBlock = (label: string, value?: string, labelW = 132) => {
      const clean = stripHtml(value);
      const textWidth = contentWidth - labelW - 13;
      const h = Math.max(16, doc.heightOfString(clean || ' ', { width: textWidth, lineGap: 0.2 }) + 2);
      ensure(h + 3);
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(6.15).fillColor('#0f172a').text(label, left, y, { width: labelW });
      doc.text(':', left + labelW + 2, y, { width: 6 });
      doc.font('Helvetica').fontSize(6.15).fillColor('#0f172a').text(clean || ' ', left + labelW + 13, y - 0.4, { width: textWidth, align: 'justify', lineGap: 0.2 });
      doc.y = y + h;
    };

    const fullTextSection = (value?: string) => {
      const clean = stripHtml(value);
      if (!clean) {
        doc.y += 8;
        return;
      }
      const h = doc.heightOfString(clean, { width: contentWidth - 6, lineGap: 0.2 });
      ensure(h + 4);
      doc.font('Helvetica').fontSize(6.15).fillColor('#0f172a').text(clean, left + 3, doc.y, { width: contentWidth - 6, align: 'justify', lineGap: 0.2 });
      doc.y += 2;
    };

    const bulletSection = (value?: string) => {
      const bullets = splitBullets(value);
      const fallbackText = stripHtml(value);
      if (!bullets.length && fallbackText) {
        const h = doc.heightOfString(fallbackText, { width: contentWidth - 6, lineGap: 0.2 });
        ensure(h + 4);
        doc.font('Helvetica').fontSize(6.15).fillColor('#0f172a').text(fallbackText, left + 3, doc.y, { width: contentWidth - 6, align: 'justify', lineGap: 0.2 });
        doc.y += 1;
        return;
      }

      const colGap = 20;
      const bulletWidth = (contentWidth - colGap) / 2;
      const startY = doc.y;
      let y1 = startY;
      let y2 = startY;
      bullets.forEach((item, index) => {
        const isLeftCol = index % 2 === 0;
        const x = isLeftCol ? left + 3 : left + bulletWidth + colGap + 3;
        const y = isLeftCol ? y1 : y2;
        const itemHeight = Math.max(7.6, doc.heightOfString(item, { width: bulletWidth - 8, lineGap: 0.2 }) + 0.8);
        ensure(itemHeight + 2);
        doc.font('Helvetica-Bold').fontSize(6.15).fillColor('#111827').text('-', x, y, { width: 6 });
        doc.font('Helvetica').fontSize(6.15).fillColor('#0f172a').text(item, x + 8, y, { width: bulletWidth - 8, lineGap: 0.2 });
        if (isLeftCol) y1 += itemHeight; else y2 += itemHeight;
      });
      doc.y = Math.max(y1, y2, startY + 16);
    };

    const benefitBox = (x: number, y: number, label: string, selected: boolean, width = 72) => {
      doc.rect(x, y + 0.8, 6.5, 6.5).lineWidth(0.55).strokeColor(line).stroke();
      if (selected) {
        doc.font('Helvetica-Bold').fontSize(5.4).fillColor(blue).text('X', x + 0.8, y + 0.3, { width: 6.5, align: 'center' });
      }
      doc.font('Helvetica-Bold').fontSize(5.9).fillColor('#0f172a').text(label, x + 9, y, { width, ellipsis: true });
    };

    drawFirstPageHeader();

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
    row(['Reason', data.reasonForHiring], ['If Replacement, Prev. Employee', data.replacementName, 126]);
    paragraphBlock('Detailed Justification (Mandatory)', data.detailedJustification, 132);
    divider();

    sectionTitle('4. Job Description Summary');
    fullTextSection(data.jobDescriptionSummary);
    divider();

    sectionTitle('5. KRA Report');
    bulletSection(data.kraReport);
    divider();

    sectionTitle('6. Compensation Details');
    ensure(44);
    const salaryY = doc.y;
    doc.font('Helvetica-Bold').fontSize(6.15).fillColor('#0f172a').text('Salary Range (CTC)', left, salaryY, { width: labelWidth });
    doc.text(':', left + labelWidth + 2, salaryY);
    doc.font('Helvetica-Bold').fontSize(6.15).text(formatMoney(data.salaryCtcMin), left + labelWidth + 12, salaryY, { width: 70 });
    doc.moveTo(left + labelWidth + 12, salaryY + 8.5).lineTo(left + labelWidth + 80, salaryY + 8.5).lineWidth(0.38).strokeColor(lightLine).stroke();
    doc.text('to', left + labelWidth + 86, salaryY, { width: 12 });
    doc.font('Helvetica-Bold').fontSize(6.15).text(formatMoney(data.salaryCtcMax), left + labelWidth + 101, salaryY, { width: 70 });
    doc.moveTo(left + labelWidth + 101, salaryY + 8.5).lineTo(left + labelWidth + 170, salaryY + 8.5).lineWidth(0.38).strokeColor(lightLine).stroke();
    inlineField(left + colWidth + gap, salaryY, 'Budget Approved By', data.budgetApprovedBy);
    doc.y += 12;

    const benefits = data.benefits || [];
    const benefitsY = doc.y;
    doc.font('Helvetica-Bold').fontSize(6.15).fillColor('#0f172a').text('Other Benefits (if any)', left, benefitsY, { width: labelWidth });
    doc.text(':', left + labelWidth + 2, benefitsY);
    const benefitStart = left + labelWidth + 13;
    benefitBox(benefitStart, benefitsY - 0.5, 'PF', benefits.includes('PF'), 24);
    benefitBox(benefitStart + 38, benefitsY - 0.5, 'Travel Allowance', benefits.includes('Travel Allowance'), 78);
    benefitBox(benefitStart + 136, benefitsY - 0.5, 'ESIC', benefits.includes('ESIC'), 34);
    benefitBox(benefitStart + 191, benefitsY - 0.5, 'Accommodation', benefits.includes('Accommodation'), 78);
    benefitBox(benefitStart + 292, benefitsY - 0.5, 'Incentives', benefits.includes('Incentives'), 54);
    benefitBox(benefitStart + 368, benefitsY - 0.5, 'Other', benefits.includes('Other'), 40);
    doc.y += 12;

    if (data.otherBenefits) {
      const otherY = doc.y;
      const otherLabelW = labelWidth;
      doc.font('Helvetica-Bold').fontSize(6.15).fillColor('#0f172a').text('Other Details', left, otherY, { width: otherLabelW });
      doc.text(':', left + otherLabelW + 2, otherY);
      const otherX = left + labelWidth + 13;
      const otherHeight = Math.max(9, doc.heightOfString(data.otherBenefits, { width: right - otherX - 5, lineGap: 0.2 }));
      ensure(otherHeight + 3);
      doc.moveTo(otherX, otherY + 8.5).lineTo(right, otherY + 8.5).lineWidth(0.38).strokeColor(lightLine).stroke();
      doc.font('Helvetica').fontSize(6).fillColor('#0f172a').text(data.otherBenefits, otherX + 3, otherY - 0.4, { width: right - otherX - 5, lineGap: 0.2 });
      doc.y = otherY + otherHeight + 4;
    }
    divider();

    sectionTitle('7. Hiring Timeline');
    row(['Expected Joining Date', data.requiredJoiningDate], ['Is this position urgent ?', data.isUrgent]);
    divider();

    sectionTitle('8. HR Use Only');
    row(['Request Received On', data.requestReceivedOn], ['Approved By', data.approvedBy]);
    row(['Recruitment Start Date', data.recruitmentStartDate], ['Recruitment Status', data.recruitmentStatus]);
    divider();

    sectionTitle('9. Declaration');
    doc.font('Helvetica-Oblique').fontSize(6.15).fillColor('#475569').text('I confirm that the above manpower requirement is essential for operational / project needs and budget provision has been considered.', left, doc.y, { width: contentWidth, height: 10, align: 'justify' });
    doc.y += 15;
    doc.font('Helvetica-Bold').fontSize(7.2).fillColor('#0f172a').text('SIGNATURE', left, doc.y);
    doc.y += 12;
    const sigY = doc.y;
    const sigW = (contentWidth - 42) / 3;
    inlineField(left, sigY, 'Department Head', data.departmentHeadSignature, sigW, 74);
    inlineField(left + sigW + 21, sigY, 'HR Head', data.hrHeadSignature, sigW, 54);
    inlineField(left + (sigW + 21) * 2, sigY, 'Director Approval', data.directorApprovalSignature, sigW, 76);
    doc.y = sigY + 14;

    if (data.footerNote) {
      doc.font('Helvetica').fontSize(5.8).fillColor('#64748b').text(data.footerNote, left, Math.min(doc.y + 3, 763), { width: contentWidth - 70, height: 8, ellipsis: true });
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text(`Page ${i + 1} / ${range.count}`, left, 780, { width: contentWidth, align: 'right' });
    }

    doc.end();
  });
};
