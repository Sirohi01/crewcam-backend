import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { generateJobDescriptionAndKra, generateInterviewQuestions, generateInterviewAnswer, AiFeatureError } from '../services/aiService';

export const triggerGenerateJdAndKra = async (req: AuthRequest, res: Response) => {
  const tenantId = (req.tenantId || req.user!.tenantId) as string;
  const { jobTitle, designation, departmentName, customPrompt } = req.body;

  if (!jobTitle) return res.status(400).json({ message: 'jobTitle is required' });

  try {
    const result = await generateJobDescriptionAndKra(tenantId, { jobTitle, designation, departmentName, customPrompt }, String(req.user!._id));
    res.status(200).json(result);
  } catch (error: any) {
    const statusCode = error instanceof AiFeatureError ? error.statusCode : 500;
    res.status(statusCode).json({
      message: error instanceof AiFeatureError ? error.message : 'AI JD/KRA generation failed',
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

export const triggerGenerateAnswer = async (req: AuthRequest, res: Response) => {
  const tenantId = (req.tenantId || req.user!.tenantId) as string;
  const interviewId = req.params.id as string;
  const questionIndex = Number(req.params.index);

  if (!Number.isInteger(questionIndex) || questionIndex < 0) return res.status(400).json({ message: 'Invalid question index' });

  try {
    const result = await generateInterviewAnswer(tenantId, interviewId, questionIndex, String(req.user!._id));
    res.status(200).json(result);
  } catch (error: any) {
    const statusCode = error instanceof AiFeatureError ? error.statusCode : 500;
    res.status(statusCode).json({
      message: error instanceof AiFeatureError ? error.message : 'AI interview answer generation failed',
      ...(process.env.NODE_ENV === 'production' && !(error instanceof AiFeatureError) ? {} : { error: error.message }),
    });
  }
};
