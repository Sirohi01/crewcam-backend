import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import { requireFeature } from '../middleware/featureGate';
import { requireAiCredits } from '../middleware/aiCreditGate';
import { aiScreeningLimiter, aiGenerationLimiter, aiInterviewRecordingLimiter } from '../middleware/rateLimiter';
import { triggerResumeScreening, getResumeScreenings, getResumeScreeningQueue, triggerExtractResumeProfile } from '../controllers/aiHiringController';
import { triggerGenerateJdAndKra, triggerGenerateInterviewQuestions, triggerGenerateAnswer } from '../controllers/aiManpowerController';
import { startInterviewSession, uploadAndAnalyzeAnswer, endInterviewSession } from '../controllers/interviewRecordingController';

const hasCloudinaryConfig = Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
    api_key: process.env.CLOUDINARY_API_KEY as string,
    api_secret: process.env.CLOUDINARY_API_SECRET as string,
  });
}

const cloudinaryRecordingStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req: any) => ({
    folder: 'crewcam_interview_recordings',
    resource_type: 'video',
    public_id: `${req.params.id}-q${req.params.index}-${Date.now()}`,
  }),
});

const localRecordingStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(process.cwd(), 'public', 'uploads', 'interview-recordings')),
  filename: (_req, file, cb) => cb(null, `rec-${Date.now()}-${Math.round(Math.random() * 1e9)}.webm`),
});

const recordingFileFilter = (_req: any, file: any, cb: any) => {
  // Browsers emit varying MediaRecorder mimetypes (webm/opus, webm/vp8, mp4 on Safari) —
  // allowlist broadly here and let the client feature-detect what it can actually record.
  const allowed = ['video/webm', 'video/mp4', 'audio/webm', 'audio/mp4'];
  if (allowed.some((type) => file.mimetype.startsWith(type))) cb(null, true);
  else cb(Object.assign(new Error('Invalid recording type'), { status: 400 }), false);
};

const uploadRecording = multer({
  storage: hasCloudinaryConfig ? cloudinaryRecordingStorage : localRecordingStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: recordingFileFilter,
});

const router = Router();
router.use(authenticate);
router.use(tenantResolver);
router.post(
  '/hiring/resume-screen/:candidateId',
  requireFeature('ai-hiring'),
  checkPermission('ATS_WRITE'),
  requireAiCredits,
  aiScreeningLimiter,
  triggerResumeScreening,
);
router.get(
  '/hiring/resume-screenings',
  requireFeature('ai-hiring'),
  checkPermission('ATS_READ'),
  getResumeScreeningQueue,
);
router.get(
  '/hiring/resume-screen/:candidateId',
  requireFeature('ai-hiring'),
  checkPermission('ATS_READ'),
  getResumeScreenings,
);
router.post(
  '/hiring/extract-resume-profile',
  requireFeature('ai-hiring'),
  checkPermission('ATS_WRITE'),
  requireAiCredits,
  aiGenerationLimiter,
  triggerExtractResumeProfile,
);
router.post(
  '/hiring/generate-jd-kra',
  requireFeature('ai-hiring'),
  checkPermission('ATS_WRITE'),
  requireAiCredits,
  aiGenerationLimiter,
  triggerGenerateJdAndKra,
);
router.post(
  '/hiring/interviews/:id/generate-questions',
  requireFeature('ai-hiring'),
  checkPermission('ATS_WRITE'),
  requireAiCredits,
  aiGenerationLimiter,
  triggerGenerateInterviewQuestions,
);
router.post(
  '/hiring/interviews/:id/questions/:index/answer',
  requireFeature('ai-hiring'),
  checkPermission('ATS_WRITE'),
  requireAiCredits,
  aiGenerationLimiter,
  triggerGenerateAnswer,
);
router.post(
  '/hiring/interviews/:id/start',
  checkPermission('ATS_WRITE'),
  startInterviewSession,
);
router.post(
  '/hiring/interviews/:id/questions/:index/recording',
  requireFeature('ai-hiring'),
  checkPermission('ATS_WRITE'),
  requireAiCredits,
  aiInterviewRecordingLimiter,
  uploadRecording.single('recording'),
  uploadAndAnalyzeAnswer,
);
router.post(
  '/hiring/interviews/:id/end',
  requireFeature('ai-hiring'),
  checkPermission('ATS_WRITE'),
  requireAiCredits,
  aiGenerationLimiter,
  endInterviewSession,
);

export default router;
