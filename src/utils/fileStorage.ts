import { v2 as cloudinary } from 'cloudinary';
import path from 'path';
import fs from 'fs/promises';
import express from 'express';

// Shared by uploadRoutes.ts (the authenticated, in-app upload button) and
// careerPortalRoutes.ts (the public job-application resume upload) — both land a buffer
// somewhere durable and hand back a URL; neither needs its own copy of this logic.

export const hasCloudinaryConfig = Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
    api_key: process.env.CLOUDINARY_API_KEY as string,
    api_secret: process.env.CLOUDINARY_API_SECRET as string
  });
}

export const uploadBufferToCloudinary = (buffer: Buffer, originalname: string, mimeType: string, folder = 'crewcam_uploads'): Promise<string> => {
  const isImage = mimeType.startsWith('image/');
  const ext = originalname.split('.').pop() || '';
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      isImage
        ? { folder, format: 'jpg', public_id: `${Date.now()}-${originalname.split('.')[0]}` }
        : { folder, resource_type: 'raw', format: ext, public_id: `${Date.now()}-${originalname.split('.')[0]}` },
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

export const writeBufferToLocalDisk = async (buffer: Buffer, originalname: string, req: express.Request): Promise<string> => {
  const ext = path.extname(originalname) || '.jpg';
  const filename = `file-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  await fs.writeFile(path.join(process.cwd(), 'public', 'uploads', filename), buffer);
  return `${req.protocol}://${req.get('host')}/uploads/${filename}`;
};

/** Stores a buffer wherever this deployment is configured to (Cloudinary if set up, else local disk) and returns its URL. */
export const storeBuffer = (buffer: Buffer, originalname: string, mimeType: string, req: express.Request, folder?: string): Promise<string> =>
  hasCloudinaryConfig
    ? uploadBufferToCloudinary(buffer, originalname, mimeType, folder)
    : writeBufferToLocalDisk(buffer, originalname, req);
