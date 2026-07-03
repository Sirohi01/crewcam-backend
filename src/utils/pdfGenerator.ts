import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';

export interface PdfLine {
  label?: string;
  value: string;
}

export interface PdfTableItem {
  description: string;
  amount: string;
}

export interface PdfOptions {
  title: string;
  companyName?: string | undefined;
  headerImageUrl?: string | undefined;
  recipientName?: string | undefined;
  recipientSubtitle?: string | undefined;
  lines: PdfLine[];
  // When set, renders an itemized table (description/amount columns + total row)
  // instead of the plain label/value list — used for proposals.
  table?: { items: PdfTableItem[]; totalLabel: string; totalValue: string } | undefined;
  preparedBy?: string | undefined;
  termsNote?: string | undefined;
  footerNote?: string | undefined;
}

const hasCloudinaryConfig = Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
    api_key: process.env.CLOUDINARY_API_KEY as string,
    api_secret: process.env.CLOUDINARY_API_SECRET as string
  });
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

export const generatePdfBuffer = async (options: PdfOptions): Promise<Buffer> => {
  const headerImage = await loadHeaderImage(options.headerImageUrl);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    if (headerImage) {
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
      doc.fontSize(11).font('Helvetica-Bold').text(`To: ${options.recipientName}`);
      if (options.recipientSubtitle) {
        doc.fontSize(9).font('Helvetica').fillColor('#666666').text(options.recipientSubtitle);
        doc.fillColor('#000000');
      }
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

    if (options.table) {
      doc.moveDown(0.5);
      const left = 50, right = 545, descX = left + 8, amountColX = 420;
      const rowHeight = 22;

      const headerTop = doc.y;
      doc.rect(left, headerTop, right - left, rowHeight).fill('#18181b');
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
      doc.text('DESCRIPTION', descX, headerTop + 6);
      doc.text('AMOUNT', amountColX, headerTop + 6, { width: right - amountColX - 8, align: 'right' });
      doc.fillColor('#000000');
      doc.y = headerTop + rowHeight;

      doc.font('Helvetica').fontSize(10);
      options.table.items.forEach((item, i) => {
        const rowTop = doc.y;
        if (i % 2 === 1) doc.rect(left, rowTop, right - left, rowHeight).fill('#f4f4f5').fillColor('#000000');
        doc.text(item.description, descX, rowTop + 6, { width: amountColX - descX - 10 });
        doc.text(item.amount, amountColX, rowTop + 6, { width: right - amountColX - 8, align: 'right' });
        doc.y = rowTop + rowHeight;
      });

      doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#18181b').lineWidth(1).stroke();
      doc.moveDown(0.4);
      const totalY = doc.y;
      doc.font('Helvetica-Bold').fontSize(11);
      doc.text(options.table.totalLabel, descX, totalY, { width: amountColX - descX - 10 });
      doc.text(options.table.totalValue, amountColX, totalY, { width: right - amountColX - 8, align: 'right' });
      doc.moveDown(1);
    }

    if (options.preparedBy) {
      doc.fontSize(9).font('Helvetica').fillColor('#444444').text(`Prepared by: ${options.preparedBy}`);
      doc.fillColor('#000000');
      doc.moveDown(0.5);
    }

    if (options.termsNote) {
      doc.moveDown(0.5);
      doc.fontSize(9).font('Helvetica-Bold').text('Terms & Conditions');
      doc.fontSize(8.5).font('Helvetica').fillColor('#444444').text(options.termsNote);
      doc.fillColor('#000000');
    }

    doc.moveDown(1.5);
    if (options.footerNote) {
      doc.fontSize(9).fillColor('#666666').text(options.footerNote, { align: 'left' });
    }

    doc.end();
  });
};

export const savePdfToCloudinary = async (buffer: Buffer, fileName: string): Promise<string> => {
  if (!hasCloudinaryConfig) {
    throw new Error('Cloudinary configuration is required for hiring PDF storage');
  }

  const safePublicId = fileName.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_');

  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        folder: 'crewcam_uploads/hiring_pdfs',
        public_id: `${Date.now()}-${safePublicId}`,
        resource_type: 'raw',
      },
      (error, result) => {
        if (error || !result?.secure_url) {
          reject(error || new Error('Cloudinary PDF upload failed'));
          return;
        }
        resolve(result.secure_url);
      }
    );

    upload.end(buffer);
  });
};

export const getSignedCloudinaryPdfUrl = (pdfUrl: string): string => {
  if (!hasCloudinaryConfig) {
    throw new Error('Cloudinary configuration is required for PDF delivery');
  }

  const parsed = new URL(pdfUrl);
  const expectedHost = `res.cloudinary.com`;
  if (parsed.hostname !== expectedHost) {
    throw new Error('Only Cloudinary PDF URLs can be proxied');
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  const rawIndex = parts.indexOf('raw');
  const uploadIndex = parts.indexOf('upload');
  if (rawIndex === -1 || uploadIndex === -1 || uploadIndex <= rawIndex) {
    throw new Error('Invalid Cloudinary raw PDF URL');
  }

  const versionPart = parts[uploadIndex + 1]?.startsWith('v') ? parts[uploadIndex + 1] : undefined;
  const publicIdStart = versionPart ? uploadIndex + 2 : uploadIndex + 1;
  const publicIdWithExt = parts.slice(publicIdStart).join('/');
  const publicId = publicIdWithExt.replace(/\.pdf$/i, '');
  const version = versionPart ? Number(versionPart.slice(1)) : undefined;
  const hasPdfExtension = publicIdWithExt.toLowerCase().endsWith('.pdf');

  return cloudinary.url(publicId, {
    resource_type: 'raw',
    type: 'upload',
    secure: true,
    sign_url: true,
    ...(hasPdfExtension ? { format: 'pdf' } : {}),
    version,
  });
};
