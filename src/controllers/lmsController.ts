import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Course } from '../models/Course';
import { Training } from '../models/Training';
import { AuditLog } from '../models/AuditLog';

const logAudit = async (tenantId: any, userId: any, action: string, req: AuthRequest, details: any) => {
  await AuditLog.create({
    tenantId,
    userId,
    action,
    module: 'Support',
    status: 'SUCCESS',
    ipAddress: req.ip as string,
    userAgent: req.headers['user-agent'] as string,
    details
  } as any);
};

export const createCourse = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });

    const course = await Course.create({ 
      ...req.body, 
      tenantId,
      createdBy: req.user!._id
    });

    await logAudit(tenantId, req.user!._id, 'CREATE_COURSE', req, { courseId: (course as any)._id });

    res.status(201).json(course);
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating course', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getCourses = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    const courses = await Course.find({ tenantId: tenantId as any, isActive: true })
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    res.status(200).json(courses);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching courses', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const enrollTraining = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    const { courseId } = req.body;
    const employeeId = req.user!._id;

    // Check if already enrolled
    const existing = await Training.findOne({ tenantId: tenantId as any, courseId, employeeId });
    if (existing) {
      return res.status(400).json({ message: 'Already enrolled in this course' });
    }

    const training = await Training.create({
      tenantId,
      courseId,
      employeeId,
      status: 'In_Progress'
    });

    await logAudit(tenantId, employeeId, 'ENROLL_TRAINING', req, { courseId, trainingId: (training as any)._id });

    res.status(201).json(training);
  } catch (error: any) {
    res.status(500).json({ message: 'Error enrolling in course', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const getMyTrainings = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID required' });
    const employeeId = req.user!._id;

    const trainings = await Training.find({ tenantId: tenantId as any, employeeId })
      .populate('courseId')
      .sort({ createdAt: -1 });

    res.status(200).json(trainings);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching trainings', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const updateTrainingProgress = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params; // training id
    const { status, score, completedModuleId } = req.body;

    const updateData: any = {};
    if (status) updateData.status = status;
    if (score !== undefined) updateData.score = score;
    if (status === 'Completed') updateData.completionDate = new Date();

    let updateQuery: any = { $set: updateData };
    if (completedModuleId) {
      updateQuery.$addToSet = { completedModules: completedModuleId };
    }

    const training = await Training.findOneAndUpdate(
      { _id: id, tenantId, employeeId: req.user!._id } as any,
      updateQuery,
      { returnDocument: 'after' }
    );

    if (!training) return res.status(404).json({ message: 'Training record not found' });

    await logAudit(tenantId, req.user!._id, 'UPDATE_TRAINING', req, { trainingId: id, status });
    res.status(200).json(training);
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating training', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};
