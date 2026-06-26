import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { JdLibrary } from '../models/JdLibrary';
import { KpaLibrary } from '../models/KpaLibrary';

// JD LIBRARY
export const listJdLibrary = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = (req.tenantId || req.user!.tenantId) as string;
    const entries = await JdLibrary.find({ tenantId }).populate('departmentId', 'name').sort({ createdAt: -1 });
    res.status(200).json(entries);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching JD library', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const createJdLibraryEntry = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = (req.tenantId || req.user!.tenantId) as string;
    const entry = await JdLibrary.create({ ...req.body, tenantId, createdBy: req.user!._id, updatedBy: req.user!._id });
    res.status(201).json(entry);
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating JD library entry', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const updateJdLibraryEntry = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = (req.tenantId || req.user!.tenantId) as string;
    const entry = await JdLibrary.findOneAndUpdate(
      { _id: req.params.id as string, tenantId },
      { ...req.body, updatedBy: req.user!._id },
      { new: true },
    );
    if (!entry) return res.status(404).json({ message: 'JD library entry not found' });
    res.status(200).json(entry);
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating JD library entry', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const deleteJdLibraryEntry = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = (req.tenantId || req.user!.tenantId) as string;
    const entry = await JdLibrary.findOneAndDelete({ _id: req.params.id as string, tenantId });
    if (!entry) return res.status(404).json({ message: 'JD library entry not found' });
    res.status(200).json({ message: 'JD library entry deleted' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting JD library entry', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

// KPA LIBRARY
export const listKpaLibrary = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = (req.tenantId || req.user!.tenantId) as string;
    const entries = await KpaLibrary.find({ tenantId }).populate('departmentId', 'name').sort({ createdAt: -1 });
    res.status(200).json(entries);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching KPA library', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const createKpaLibraryEntry = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = (req.tenantId || req.user!.tenantId) as string;
    const entry = await KpaLibrary.create({ ...req.body, tenantId, createdBy: req.user!._id, updatedBy: req.user!._id });
    res.status(201).json(entry);
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating KPA library entry', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const updateKpaLibraryEntry = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = (req.tenantId || req.user!.tenantId) as string;
    const entry = await KpaLibrary.findOneAndUpdate(
      { _id: req.params.id as string, tenantId },
      { ...req.body, updatedBy: req.user!._id },
      { new: true },
    );
    if (!entry) return res.status(404).json({ message: 'KPA library entry not found' });
    res.status(200).json(entry);
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating KPA library entry', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};

export const deleteKpaLibraryEntry = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = (req.tenantId || req.user!.tenantId) as string;
    const entry = await KpaLibrary.findOneAndDelete({ _id: req.params.id as string, tenantId });
    if (!entry) return res.status(404).json({ message: 'KPA library entry not found' });
    res.status(200).json({ message: 'KPA library entry deleted' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting KPA library entry', ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message }) });
  }
};
