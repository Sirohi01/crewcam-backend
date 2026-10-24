import express, { Response } from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import { authenticate, AuthRequest } from '../middleware/auth';
import { uploadModerationLimiter } from '../middleware/rateLimiter';
import { moderateImage, reviewDocument } from '../services/contentModerationService';
import { storeBuffer } from '../utils/fileStorage';

dotenv.config();

const router = express.Router();

const fileFilter = (_req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/csv', 'text/plain', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error: any = new Error('Invalid file type. Only JPEG, PNG, WEBP, PDF, DOCX, CSV, TXT and XLSX are allowed.');
    error.status = 400;
    cb(error);
  }
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter,
});

// Upload endpoint
router.post('/', authenticate, uploadModerationLimiter, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const tenantId = String(req.tenantId || req.user?.tenantId || '');
    const { buffer, mimetype, originalname } = req.file;
    const documentLabel = typeof req.body?.documentLabel === 'string' ? req.body.documentLabel : undefined;

    let review: { verdict: string; reason: string } | undefined;
    let warning: string | undefined;

    if (mimetype.startsWith('image/')) {
      const moderation = await moderateImage(tenantId, buffer, mimetype);
      if (moderation.checked && !moderation.safe) {
        const categoryLabel = moderation.categories.filter((c) => c !== 'none').join(', ');
        const detail = moderation.reason || (categoryLabel ? `Detected: ${categoryLabel}` : undefined);
        warning = detail ? `Image flagged by AI: ${detail}` : 'Image flagged by AI.';
        console.warn(`[Content Moderation] Upload allowed with warning. Reason: ${detail}`);
      }
      if (moderation.warning) warning = moderation.warning;
    } else {
      const docReview = await reviewDocument(tenantId, buffer, mimetype, documentLabel);
      if (docReview) review = { verdict: docReview.verdict, reason: docReview.reason };
    }

    const fileUrl = await storeBuffer(buffer, originalname, mimetype, req);

    res.status(200).json({ url: fileUrl, ...(review ? { review } : {}), ...(warning ? { warning } : {}) });
  } catch (error) {
    res.status(500).json({ message: 'Error uploading file', error: (error as any).message });
  }
});

export default router;
