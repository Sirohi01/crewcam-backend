import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

type IdCardPdfData = {
  companyName: string;
  employeeName: string;
  employeeCode: string;
  designation: string;
  bloodGroup?: string;
  validTo?: Date | null;
  cardType: string;
  theme: string;
  frontLabel: string;
  backNote: string;
  qrPayload: string;
};

const rounded = (doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, color: string) => {
  doc.roundedRect(x, y, w, h, 10).fill(color);
};

/** A print-ready two-page CR80-size card: page 1 front, page 2 QR back. */
export const generateIdCardPdfBuffer = async (data: IdCardPdfData): Promise<Buffer> => new Promise(async (resolve, reject) => {
  try {
    const doc = new PDFDocument({ size: [242, 153], margin: 0, layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const theme = /^#[0-9A-Fa-f]{6}$/.test(data.theme) ? data.theme : '#0e4778';
    rounded(doc, 0, 0, 242, 153, '#ffffff');
    rounded(doc, 0, 0, 242, 35, theme);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10).text(data.companyName.toUpperCase(), 14, 11, { width: 210, align: 'center' });
    doc.fillColor('#dbeafe').font('Helvetica').fontSize(5.5).text(data.frontLabel.toUpperCase(), 14, 24, { width: 210, align: 'center' });
    doc.fillColor('#e2e8f0').roundedRect(15, 48, 55, 66, 5).fill();
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(20).text(data.employeeName.slice(0, 1).toUpperCase(), 15, 71, { width: 55, align: 'center' });
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13).text(data.employeeName, 82, 52, { width: 145 });
    doc.fillColor(theme).font('Helvetica-Bold').fontSize(7).text(data.designation || 'Employee', 82, 71, { width: 145 });
    doc.fillColor('#475569').font('Helvetica').fontSize(6.5).text(`ID: ${data.employeeCode || '—'}`, 82, 88);
    doc.text(`Blood Group: ${data.bloodGroup || '—'}`, 82, 100);
    doc.text(`Valid up to: ${data.validTo ? new Date(data.validTo).toLocaleDateString('en-GB') : '—'}`, 82, 112);
    doc.fillColor('#94a3b8').fontSize(5).text(`${data.cardType} · System generated`, 15, 138, { width: 212, align: 'center' });

    doc.addPage({ size: [242, 153], margin: 0, layout: 'landscape' });
    rounded(doc, 0, 0, 242, 153, '#ffffff');
    rounded(doc, 0, 0, 242, 28, theme);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text(`${data.companyName.toUpperCase()} · VERIFY`, 14, 10, { width: 214, align: 'center' });
    const qr = await QRCode.toDataURL(data.qrPayload, { errorCorrectionLevel: 'M', margin: 1, width: 290 });
    doc.image(Buffer.from(qr.split(',')[1] || '', 'base64'), 84, 38, { width: 74, height: 74 });
    doc.fillColor('#334155').font('Helvetica').fontSize(6.5).text(data.backNote, 25, 119, { width: 192, align: 'center' });
    doc.fillColor('#94a3b8').fontSize(5).text('If found, please return to the company.', 25, 136, { width: 192, align: 'center' });
    doc.end();
  } catch (error) { reject(error); }
});
