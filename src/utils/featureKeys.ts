import mongoose from 'mongoose';
import { PlatformModule } from '../models/dropdowns/Module';
import { AddOnModule } from '../models/dropdowns/AddOnModule';

/**
 * Single source of truth for "which features does this tenant have", shared by the API
 * gate (middleware/featureGate.ts) and the sidebar (utils/visibilityFilter.ts) so the two
 * can never disagree about whether a module is switched on.
 */

export const normalizeFeatureKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Feature key of the optional Payment Obligations add-on (Phase 7 module). */
export const PAYMENT_OBLIGATIONS_FEATURE = 'payment-obligations';

/**
 * Sidebar sections owned by an add-on. Tenants restricted to `allowedSections` would
 * otherwise never see an add-on's section even after buying it.
 */
export const FEATURE_SECTIONS: Record<string, string[]> = {
  [normalizeFeatureKey(PAYMENT_OBLIGATIONS_FEATURE)]: ['Payment Obligations'],
};

const isObjectIdString = (value: string) => /^[a-f0-9]{24}$/i.test(value);

/**
 * Package and company feature lists hold a mix of plain names ("Core HR"), slugs
 * ("ai-analytics") and — since the v2 plan builder — catalogue document IDs. IDs are
 * expanded into the module's name and code; anything else passes through unchanged.
 * Modules marked inactive in the catalogue contribute nothing, which makes "Inactive"
 * a platform-wide off switch.
 */
export const expandFeatureEntries = async (entries: unknown[] | undefined): Promise<string[]> => {
  const values = (entries || []).filter((v) => v !== null && v !== undefined && v !== '').map(String);
  const ids = values.filter(isObjectIdString);
  if (ids.length === 0) return values;

  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
  const [modules, addOns] = await Promise.all([
    PlatformModule.find({ _id: { $in: objectIds }, isActive: true }).select('name code').lean(),
    AddOnModule.find({ _id: { $in: objectIds }, isActive: true }).select('name code').lean(),
  ]);
  const resolved = [...modules, ...addOns].flatMap((m) => [m.name, m.code]);

  return [...values.filter((v) => !isObjectIdString(v)), ...resolved];
};
