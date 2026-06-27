import { Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { AuthRequest } from '../middleware/auth';
import { Interview } from '../models/Interview';
import { advanceStep } from '../utils/hiringPipelineHelpers';
import {
  startInterviewSession as startSession,
  analyzeAnswerRecording,
  generateOverallInterviewAnalysis,
  AiFeatureError,
} from '../services/aiService';

const sendError = (res: Response, error: any, fallbackMessage: string) => {
  const statusCode = error instanceof AiFeatureError ? error.statusCode : 500;
  res.status(statusCode).json({
    message: error instanceof AiFeatureError ? error.message : fallbackMessage,
    ...(process.env.NODE_ENV === 'production' && !(error instanceof AiFeatureError) ? {} : { error: error.message }),
  });
};

export const startInterviewSession = async (req: AuthRequest, res: Response) => {
  const tenantId = (req.tenantId || req.user!.tenantId) as string;
  const interviewId = req.params.id as string;

  try {
    const result = await startSession(tenantId, interviewId);
    res.status(200).json(result);
  } catch (error: any) {
    sendError(res, error, 'Could not start interview session');
  }
};

export const uploadAndAnalyzeAnswer = async (req: AuthRequest, res: Response) => {
  const tenantId = (req.tenantId || req.user!.tenantId) as string;
  const interviewId = req.params.id as string;
  const questionIndex = Number(req.params.index);

  if (!Number.isInteger(questionIndex) || questionIndex < 0) return res.status(400).json({ message: 'Invalid question index' });
  if (!req.file) return res.status(400).json({ message: 'No recording uploaded' });

  const recordingUrl = req.file.path;
  const recordingPublicId: string | undefined = (req.file as any).filename;

  try {
    const result = await analyzeAnswerRecording(
      tenantId,
      interviewId,
      questionIndex,
      { recordingUrl, recordingPublicId, mimeType: req.file.mimetype },
      String(req.user!._id),
    );
    res.status(200).json(result);
  } catch (error: any) {
    if (error instanceof AiFeatureError && error.code === 'UNSAFE_CONTENT' && recordingPublicId) {
      try {
        await cloudinary.uploader.destroy(recordingPublicId, { resource_type: 'video' });
      } catch {
        // best-effort cleanup — the flagged response below is what matters to the client
      }
    }
    sendError(res, error, 'AI answer analysis failed');
  }
};

export const endInterviewSession = async (req: AuthRequest, res: Response) => {
  const tenantId = (req.tenantId || req.user!.tenantId) as string;
  const interviewId = req.params.id as string;

  try {
    const result = await generateOverallInterviewAnalysis(tenantId, interviewId, String(req.user!._id));

    const interview = await Interview.findOne({ _id: interviewId, tenantId } as any);
    if (interview) {
      await advanceStep(req, String(tenantId), String(interview.candidateId), 'interview', 'completed', interview._id as any);
    }

    res.status(200).json(result);
  } catch (error: any) {
    sendError(res, error, 'AI interview summary generation failed');
  }
};
