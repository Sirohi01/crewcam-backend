import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export interface PdfLine {
  label?: string;
  value: string;
}

export interface PdfOptions {
  title: string;
  companyName?: string | undefined;
  recipientName?: string | undefined;
  lines: PdfLine[];
  footerNote?: string | undefined;
}

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'hiring');

export const generatePdfBuffer = (options: PdfOptions): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).font('Helvetica-Bold').text(options.companyName || 'CREWCAM', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(13).font('Helvetica-Bold').text(options.title, { align: 'center' });
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(1);

    if (options.recipientName) {
      doc.fontSize(11).font('Helvetica').text(`To: ${options.recipientName}`);
      doc.moveDown(0.5);
    }

    doc.fontSize(10).font('Helvetica');
    for (const line of options.lines) {
      if (line.label) {
        doc.font('Helvetica-Bold').text(`${line.label}: `, { continued: true });
        doc.font('Helvetica').text(line.value);
      } else {
        doc.font('Helvetica').text(line.value);
      }
      doc.moveDown(0.3);
    }

    doc.moveDown(2);
    if (options.footerNote) {
      doc.fontSize(9).fillColor('#666666').text(options.footerNote, { align: 'left' });
    }

    doc.end();
  });
};

export const savePdfToLocalDisk = (buffer: Buffer, fileName: string): string => {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const filePath = path.join(UPLOAD_DIR, safeName);
  fs.writeFileSync(filePath, buffer);
  return `/uploads/hiring/${safeName}`;
};
