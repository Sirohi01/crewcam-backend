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
  headerImageUrl?: string | undefined;
  recipientName?: string | undefined;
  lines: PdfLine[];
  footerNote?: string | undefined;
}

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'hiring');

const loadHeaderImage = async (imageUrl?: string): Promise<Buffer | null> => {
  if (!imageUrl) return null;
  try {
    const parsed = new URL(imageUrl, 'http://local');
    if (parsed.pathname.startsWith('/uploads/')) {
      return fs.promises.readFile(path.join(process.cwd(), 'public', parsed.pathname));
    }
    // Document artwork is uploaded through our uploader (local storage or Cloudinary).
    // Do not turn PDF generation into a server-side request proxy for arbitrary URLs.
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

export const generatePdfBuffer = async (options: PdfOptions): Promise<Buffer> => {
  const headerImage = await loadHeaderImage(options.headerImageUrl);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    if (headerImage) {
      // Keep the full image visible; a company can prepare a wide A4 header without it being cropped.
      doc.image(headerImage, 50, 36, { fit: [495, 100], align: 'center', valign: 'center' });
      doc.y = 148;
    } else {
      doc.fontSize(16).font('Helvetica-Bold').text(options.companyName || 'CREWCAM', { align: 'center' });
      doc.moveDown(0.5);
    }
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
