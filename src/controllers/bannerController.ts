import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Banner } from '../models/Banner';
import { z } from 'zod';

const bannerSchema = z.object({
  tag: z.string().optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  primaryLabel: z.string().optional(),
  primaryHref: z.string().optional(),
  secondaryLabel: z.string().optional(),
  secondaryHref: z.string().optional(),
  imageUrl: z.string().min(1, 'A banner image is required'),
  isActive: z.boolean().optional().default(true),
  order: z.coerce.number().optional().default(0),
});

export const getAllBanners = async (_req: AuthRequest, res: Response) => {
  try {
    const banners = await Banner.find().sort({ order: 1, createdAt: -1 }).lean();
    res.status(200).json(banners);
  } catch (error) {
    console.error('Error fetching banners:', error);
    res.status(500).json({ message: 'Internal server error while fetching banners' });
  }
};

export const createBanner = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = bannerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const banner = new Banner({ ...parsed.data, ...(req.user?._id && { createdBy: req.user._id }) });
    await banner.save();
    res.status(201).json(banner);
  } catch (error) {
    console.error('Error creating banner:', error);
    res.status(500).json({ message: 'Internal server error while creating banner' });
  }
};

export const updateBanner = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = bannerSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      { ...parsed.data, ...(req.user?._id && { updatedBy: req.user._id }) },
      { new: true, runValidators: true },
    );
    if (!banner) return res.status(404).json({ message: 'Banner not found' });
    res.status(200).json(banner);
  } catch (error) {
    console.error('Error updating banner:', error);
    res.status(500).json({ message: 'Internal server error while updating banner' });
  }
};

export const deleteBanner = async (req: AuthRequest, res: Response) => {
  try {
    const banner = await Banner.findByIdAndDelete(req.params.id);
    if (!banner) return res.status(404).json({ message: 'Banner not found' });
    res.status(200).json({ message: 'Banner deleted successfully' });
  } catch (error) {
    console.error('Error deleting banner:', error);
    res.status(500).json({ message: 'Internal server error while deleting banner' });
  }
};
