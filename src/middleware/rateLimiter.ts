import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    message: 'Too many authentication attempts from this IP, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => process.env.NODE_ENV === 'development',
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    message: 'Too many requests from this IP, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => process.env.NODE_ENV === 'development',
});
export const bulkNotificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    message: 'Too many bulk notification sends from this IP, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => process.env.NODE_ENV === 'development',
});
export const aiScreeningLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    message: 'Too many AI screening requests from this IP, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => process.env.NODE_ENV === 'development',
});
export const aiSummaryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    message: 'Too many AI summary requests from this IP, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => process.env.NODE_ENV === 'development',
});
export const aiGenerationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: {
    message: 'Too many AI generation requests from this IP, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => process.env.NODE_ENV === 'development',
});
export const aiInterviewRecordingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // one interview's worth of per-question clips (8-10 questions) plus headroom for re-recording an answer
  message: {
    message: 'Too many interview recording analyses, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    const tenantId = req.tenantId || req.user?.tenantId;
    return tenantId ? String(tenantId) : ipKeyGenerator(req.ip);
  },
  skip: (req, res) => process.env.NODE_ENV === 'development',
});
export const uploadModerationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    message: 'Too many uploads from this account, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    const tenantId = req.tenantId || req.user?.tenantId;
    return tenantId ? String(tenantId) : ipKeyGenerator(req.ip);
  },
  skip: (req, res) => process.env.NODE_ENV === 'development',
});
