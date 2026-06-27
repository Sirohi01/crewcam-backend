import express, { Response } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { authenticate, AuthRequest } from '../middleware/auth';
import { uploadModerationLimiter } from '../middleware/rateLimiter';
import { moderateImage, reviewDocument } from '../services/contentModerationService';

dotenv.config();

const router = express.Router();
const hasCloudinaryConfig = Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
    api_key: process.env.CLOUDINARY_API_KEY as string,
    api_secret: process.env.CLOUDINARY_API_SECRET as string
  });
}

const fileFilter = (_req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error: any = new Error('Invalid file type. Only JPEG, PNG, WEBP, PDF, DOCX, CSV and XLSX are allowed.');
    error.status = 400;
    cb(error);
  }
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter,
});

const uploadBufferToCloudinary = (buffer: Buffer, originalname: string, mimeType: string): Promise<string> => {
  const isImage = mimeType.startsWith('image/');
  const ext = originalname.split('.').pop() || '';
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      isImage
        ? { folder: 'crewcam_uploads', format: 'jpg', public_id: `${Date.now()}-${originalname.split('.')[0]}` }
        : { folder: 'crewcam_uploads', resource_type: 'raw', format: ext, public_id: `${Date.now()}-${originalname.split('.')[0]}` },
      (error, result) => {
        if (error || !result?.secure_url) {
          reject(error || new Error('Cloudinary upload failed'));
          return;
        }
        resolve(result.secure_url);
      }
    );
    uploadStream.end(buffer);
  });
};

const writeBufferToLocalDisk = async (buffer: Buffer, originalname: string, req: express.Request): Promise<string> => {
  const ext = path.extname(originalname) || '.jpg';
  const filename = `file-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  await fs.writeFile(path.join(process.cwd(), 'public', 'uploads', filename), buffer);
  return `${req.protocol}://${req.get('host')}/uploads/${filename}`;
};

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
        return res.status(422).json({
          message: detail ? `This image cannot be uploaded: ${detail}` : 'This image cannot be uploaded.',
          categories: moderation.categories,
          reason: moderation.reason,
        });
      }
      if (moderation.warning) warning = moderation.warning;
    } else {
      const docReview = await reviewDocument(tenantId, buffer, mimetype, documentLabel);
      if (docReview) review = { verdict: docReview.verdict, reason: docReview.reason };
    }

    const fileUrl = hasCloudinaryConfig
      ? await uploadBufferToCloudinary(buffer, originalname, mimetype)
      : await writeBufferToLocalDisk(buffer, originalname, req);

    res.status(200).json({ url: fileUrl, ...(review ? { review } : {}), ...(warning ? { warning } : {}) });
  } catch (error) {
    res.status(500).json({ message: 'Error uploading file', error: (error as any).message });
  }
});

export default router;
