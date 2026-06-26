import rateLimit from 'express-rate-limit';

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
  // tenant-keyed (not pure-IP) so two interviewers on the same office network running separate
  // interviews don't contend for the same bucket
  keyGenerator: (req: any) => String(req.tenantId || req.user?.tenantId || req.ip),
  skip: (req, res) => process.env.NODE_ENV === 'development',
});
