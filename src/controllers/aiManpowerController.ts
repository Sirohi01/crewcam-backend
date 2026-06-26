import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { generateJobDescription, generateKpa, generateInterviewQuestions, AiFeatureError } from '../services/aiService';

export const triggerGenerateJd = async (req: AuthRequest, res: Response) => {
  const tenantId = (req.tenantId || req.user!.tenantId) as string;
  const { jobTitle, designation, departmentName } = req.body;

  if (!jobTitle) return res.status(400).json({ message: 'jobTitle is required' });

  try {
    const result = await generateJobDescription(tenantId, { jobTitle, designation, departmentName }, String(req.user!._id));
    res.status(200).json(result);
  } catch (error: any) {
    const statusCode = error instanceof AiFeatureError ? error.statusCode : 500;
    res.status(statusCode).json({
      message: error instanceof AiFeatureError ? error.message : 'AI JD generation failed',
      ...(process.env.NODE_ENV === 'production' && !(error instanceof AiFeatureError) ? {} : { error: error.message }),
    });
  }
};

export const triggerGenerateKra = async (req: AuthRequest, res: Response) => {
  const tenantId = (req.tenantId || req.user!.tenantId) as string;
  const { jobTitle, designation, departmentName } = req.body;

  if (!jobTitle) return res.status(400).json({ message: 'jobTitle is required' });

  try {
    const result = await generateKpa(tenantId, { jobTitle, designation, departmentName }, String(req.user!._id));
    res.status(200).json(result);
  } catch (error: any) {
    const statusCode = error instanceof AiFeatureError ? error.statusCode : 500;
    res.status(statusCode).json({
      message: error instanceof AiFeatureError ? error.message : 'AI KRA generation failed',
      ...(process.env.NODE_ENV === 'production' && !(error instanceof AiFeatureError) ? {} : { error: error.message }),
    });
  }
};

export const triggerGenerateInterviewQuestions = async (req: AuthRequest, res: Response) => {
  const tenantId = (req.tenantId || req.user!.tenantId) as string;
  const interviewId = req.params.id as string;

  try {
    const result = await generateInterviewQuestions(tenantId, interviewId, String(req.user!._id));
    res.status(200).json(result);
  } catch (error: any) {
    const statusCode = error instanceof AiFeatureError ? error.statusCode : 500;
    res.status(statusCode).json({
      message: error instanceof AiFeatureError ? error.message : 'AI interview question generation failed',
      ...(process.env.NODE_ENV === 'production' && !(error instanceof AiFeatureError) ? {} : { error: error.message }),
    });
  }
};
