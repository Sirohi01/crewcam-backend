import express from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { authenticate } from '../middleware/auth';
import dotenv from 'dotenv';
import path from 'path';

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

const cloudinaryStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const ext = file.originalname.split('.').pop() || '';
    const isImage = file.mimetype.startsWith('image/');
    // Forcing format: 'jpg' on every upload (the old behavior) silently mangled non-image
    // files — a PDF/DOCX resume would get coerced into a "jpg" asset and become unreadable.
    // Documents need resource_type: 'raw' and their original extension preserved instead.
    return isImage
      ? {
          folder: 'crewcam_uploads',
          format: 'jpg',
          public_id: `${Date.now()}-${file.originalname.split('.')[0]}`,
        }
      : {
          folder: 'crewcam_uploads',
          resource_type: 'raw',
          format: ext,
          public_id: `${Date.now()}-${file.originalname.split('.')[0]}`,
        };
  },
});

const localStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(process.cwd(), 'public', 'uploads'));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `file-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

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
  storage: hasCloudinaryConfig ? cloudinaryStorage : localStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter
});

// Upload endpoint
router.post('/', authenticate, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    const uploadedPath = req.file.path;
    const fileUrl = hasCloudinaryConfig
      ? uploadedPath
      : `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.status(200).json({ url: fileUrl });
  } catch (error) {
    res.status(500).json({ message: 'Error uploading file', error: (error as any).message });
  }
});

export default router;
