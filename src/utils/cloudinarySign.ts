import { v2 as cloudinary } from 'cloudinary';

const hasCloudinaryConfig = Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
    api_key: process.env.CLOUDINARY_API_KEY as string,
    api_secret: process.env.CLOUDINARY_API_SECRET as string,
  });
}
export const toSignedCloudinaryUrl = (fileUrl: string): string => {
  if (!hasCloudinaryConfig) return fileUrl;

  const match = fileUrl.match(/^https?:\/\/res\.cloudinary\.com\/[^/]+\/raw\/upload\/(?:v\d+\/)?(.+)$/);
  if (!match) return fileUrl;

  const publicId = match[1];
  if (!publicId) return fileUrl;
  return cloudinary.utils.private_download_url(publicId, '', { resource_type: 'raw', type: 'upload' });
};
