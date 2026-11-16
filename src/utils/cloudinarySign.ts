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

  // The captured path segment is still URL-encoded (e.g. "%20" for a space) and still carries
  // its file extension — Cloudinary's real public_id has neither: it's the decoded path with
  // the extension split out into its own `format` argument. Passing the raw, still-encoded,
  // still-extensioned string as the public_id (as this used to) computes a signature for an id
  // Cloudinary never stored, so the signed URL 404s for any filename with a space or a dot.
  const decodedPath = decodeURIComponent(match[1]);
  const lastDot = decodedPath.lastIndexOf('.');
  const publicId = lastDot > 0 ? decodedPath.slice(0, lastDot) : decodedPath;
  const format = lastDot > 0 ? decodedPath.slice(lastDot + 1) : '';
  if (!publicId) return fileUrl;
  return cloudinary.utils.private_download_url(publicId, format, { resource_type: 'raw', type: 'upload' });
};
