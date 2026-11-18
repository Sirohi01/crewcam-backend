import { ModuleFeature } from '../models/dropdowns/ModuleFeature';
import { PlatformModule } from '../models/dropdowns/Module';

// Priced (third-party / usage) features from Crewcam_Recommended_Packages_Profit_Model.xlsx — sheet "06 ADD ONS"
// list prices, sheet "03 UNIT ECONOMICS" (WhatsApp overage Rs 0.5/message and quotas of 100 / 250 messages per
// tenant on Growth / Business, AI voice interview Rs 199 sell / Rs 65 loaded cost) and "02 FEATURE MATRIX" for the
// plans that carry each one. Native, plan-included features (geo-fence, shifts, payslips...) are left unpriced on
// purpose: their price is the plan rate, so pricing them here would double-charge in the plan builder.
const PAID_TIERS = ['STARTER', 'GROWTH', 'PRO', 'ENTERPRISE'];

interface FeatureSeed {
    moduleCode: string;
    name: string;
    code: string;
    description: string;
    provider?: string;
    yourCost?: number;
    sellingPrice: number;
    billingType: string;
    billingCycle: string;
    usageLimitEnabled?: boolean;
    unitsIncluded?: number;
    additionalUnitCost?: number;
    packageTiers: string[];
}

const features: FeatureSeed[] = [
    {
        moduleCode: 'ESS', name: 'WhatsApp Notification', code: 'WHATSAPP-NOTIFICATION',
        description: 'Utility notifications (attendance, payslip, alerts). Metered on Essential, quota of 100 messages per tenant on Growth and 250 on Business, agreed pool on Enterprise; overage Rs 0.5 per message.',
        provider: 'WhatsApp Business', yourCost: 0.8, sellingPrice: 0.5, billingType: 'Usage Based', billingCycle: 'Per Message',
        usageLimitEnabled: true, unitsIncluded: 100, additionalUnitCost: 0.5, packageTiers: PAID_TIERS,
    },
    {
        moduleCode: 'ATTENDANCE-MGMT', name: 'Face Recognition (AI)', code: 'FACE-RECOGNITION-AI',
        description: 'Face + smart liveness for field users. Risk-based liveness checks only; excess checks at the agreed rate. Add-on on all paid plans, by agreement on Enterprise.',
        provider: 'AWS Rekognition', sellingPrice: 39, billingType: 'Usage Based', billingCycle: 'Per Field User / Month', packageTiers: PAID_TIERS,
    },
    {
        moduleCode: 'DOCUMENT-MGMT', name: 'Digital eSign', code: 'DIGITAL-ESIGN',
        description: 'Digital signature on letters and documents. Vendor cost plus handling, billed on actual consumption.',
        sellingPrice: 39, billingType: 'Usage Based', billingCycle: 'Per Signature', packageTiers: PAID_TIERS,
    },
    {
        moduleCode: 'RECRUITMENT-ATS', name: 'AI Voice Interview', code: 'AI-VOICE-INTERVIEW',
        description: 'Extra AI voice interview, paid credits on every plan. 15-minute usage cap; extra minutes billed.',
        yourCost: 65, sellingPrice: 199, billingType: 'Usage Based', billingCycle: 'Per Interview', packageTiers: PAID_TIERS,
    },
    {
        moduleCode: 'ESS', name: 'AI Policy Assistant', code: 'AI-POLICY-ASSISTANT',
        description: 'AI policy assistant (AI Assist add-on). Limited trial on Essential, fair-use basic on Growth and Business, agreed credits on Enterprise; upgrade for intensive usage.',
        sellingPrice: 15, billingType: 'Usage Based', billingCycle: 'Per Employee / Month', packageTiers: PAID_TIERS,
    },
];

// Upserts by (module, name) — the collection's unique key — so existing priced features are corrected in place.
export const seedPlanFeatures = async () => {
    try {
        console.log('Upserting priced plan features...');
        for (const { moduleCode, ...f } of features) {
            const mod: any = await PlatformModule.findOne({ code: moduleCode }).lean();
            if (!mod) {
                console.warn(`  skipped "${f.name}": module ${moduleCode} not found`);
                continue;
            }
            const existing = await ModuleFeature.findOne({ $or: [{ moduleId: mod._id, name: f.name }, { code: f.code }] });
            const doc = existing || new ModuleFeature({ moduleId: mod._id, name: f.name, code: f.code, type: 'Third-Party' });
            doc.set({ ...f, type: 'Third-Party', isActive: true });
            // Face / eSign costs are not in the Excel; the old flat-per-company cost no longer matches the per-user unit.
            if (f.yourCost === undefined) doc.set('yourCost', undefined);
            await doc.save();
        }
        console.log('Plan feature seeding completed successfully!');
    } catch (error) {
        console.error('Plan feature seeding failed:', error);
        throw error;
    }
};
