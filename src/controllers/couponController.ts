import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Coupon } from '../models/Coupon';
import { z } from 'zod';

const couponSchema = z.object({
  code: z.string().trim().min(3, 'Code must be at least 3 characters'),
  type: z.enum(['PERCENTAGE', 'FIXED']),
  value: z.coerce.number().positive('Value must be greater than 0'),
  appliesTo: z.enum(['SETUP_FEE', 'SUBSCRIPTION', 'BOTH']).optional().default('BOTH'),
  maxRedemptions: z.coerce.number().min(1).optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
});

export const getAllCoupons = async (_req: AuthRequest, res: Response) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
    res.status(200).json(coupons);
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({ message: 'Internal server error while fetching coupons' });
  }
};

export const createCoupon = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = couponSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    if (parsed.data.type === 'PERCENTAGE' && parsed.data.value > 100) {
      return res.status(400).json({ message: 'Percentage discount cannot exceed 100%' });
    }

    const existing = await Coupon.findOne({ code: parsed.data.code.toUpperCase() });
    if (existing) return res.status(400).json({ message: 'A coupon with this code already exists' });

    const coupon = new Coupon({
      ...parsed.data,
      ...(req.user?._id && { createdBy: req.user._id }),
    });
    await coupon.save();
    res.status(201).json(coupon);
  } catch (error) {
    console.error('Error creating coupon:', error);
    res.status(500).json({ message: 'Internal server error while creating coupon' });
  }
};

export const updateCoupon = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = couponSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const { isActive } = req.body;

    const coupon = await Coupon.findByIdAndUpdate(
      req.params.id,
      { ...parsed.data, ...(isActive !== undefined && { isActive }) },
      { new: true, runValidators: true },
    );
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    res.status(200).json(coupon);
  } catch (error) {
    console.error('Error updating coupon:', error);
    res.status(500).json({ message: 'Internal server error while updating coupon' });
  }
};

export const deleteCoupon = async (req: AuthRequest, res: Response) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    res.status(200).json({ message: 'Coupon deleted successfully' });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json({ message: 'Internal server error while deleting coupon' });
  }
};

/**
 * Validates a coupon against the invoice type it's being applied to and computes the
 * discount in the invoice's own currency. Does NOT increment redeemedCount — that only
 * happens once the invoice is actually generated (see billingController.generateInvoice),
 * so a coupon preview/validation call never consumes a redemption.
 */
export async function resolveCouponDiscount(code: string, appliesTo: 'SETUP_FEE' | 'SUBSCRIPTION', baseAmount: number): Promise<{ coupon: any; discountAmount: number } | { error: string }> {
  const coupon = await Coupon.findOne({ code: code.toUpperCase() });
  if (!coupon) return { error: 'Coupon not found' };
  if (!coupon.isActive) return { error: 'Coupon is not active' };
  if (coupon.appliesTo !== 'BOTH' && coupon.appliesTo !== appliesTo) {
    return { error: `This coupon only applies to ${coupon.appliesTo === 'SETUP_FEE' ? 'setup fee' : 'subscription'} invoices` };
  }
  const now = new Date();
  if (coupon.validFrom && now < coupon.validFrom) return { error: 'Coupon is not yet valid' };
  if (coupon.validUntil && now > coupon.validUntil) return { error: 'Coupon has expired' };
  if (coupon.maxRedemptions && coupon.redeemedCount >= coupon.maxRedemptions) return { error: 'Coupon redemption limit reached' };

  const discountAmount = coupon.type === 'PERCENTAGE'
    ? Math.round((baseAmount * coupon.value) / 100)
    : Math.min(coupon.value, baseAmount);

  return { coupon, discountAmount };
}
