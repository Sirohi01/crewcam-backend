import { AddOnModule } from '../models/dropdowns/AddOnModule';

// Add-on price list from Crewcam_Recommended_Packages_Profit_Model.xlsx, sheet "06 ADD ONS". Only rows with
// a fixed list price are seeded; "Custom"/"Quote" rows (background verification, data migration, custom
// integrations) are priced per deal and are left out. Prices are recommended test prices, not supplier quotes.
const planAddOns = [
    { name: 'AI Assist', code: 'ai-assist', price: 15, pricingUnit: 'Per Employee / Month', category: 'Advanced', badge: 'Popular', description: 'AI policy assistant. Soft quota; upgrade for intensive usage.' },
    { name: 'AI Hire Recruiter Seat', code: 'ai-hire', price: 1299, pricingUnit: 'Per Recruiter / Month', category: 'Talent', description: '250 screenings and 3 interviews per month. One seat per recruiter.' },
    { name: 'Extra AI Voice Interview', code: 'ai-voice-interview', price: 199, pricingUnit: 'Per Interview', category: 'Talent', description: '15-minute usage cap; extra minutes billed.' },
    { name: 'GPS Live Tracking', code: 'gps-live-tracking', price: 59, pricingUnit: 'Per Tracked User / Month', category: 'Workforce', description: 'Continuous tracks; retained days capped. Needs battery and privacy consent.' },
    { name: 'Face + Smart Liveness', code: 'face-liveness', price: 39, pricingUnit: 'Per Field User / Month', category: 'Workforce', description: 'Risk-based liveness checks only; excess checks at the agreed rate.' },
    { name: 'WhatsApp Utility Pack', code: 'whatsapp-utility-pack', price: 499, pricingUnit: 'Per 1,000 Messages', category: 'Advanced', description: 'Template charges can differ; confirm the current Meta / BSP tariff.' },
    { name: 'Digital eSign', code: 'digital-esign', price: 39, pricingUnit: 'Per Signature', category: 'Core HR', description: 'Vendor cost plus handling; billed on actual consumption.' },
    // Priced per deal in the sheet ("Custom" / "Quote" / "Rs 0 standard"), so the list price is 0 and the unit says how it is billed.
    { name: 'Background Verification', code: 'background-verification', price: 0, pricingUnit: 'Per Candidate (Custom)', category: 'Talent', description: 'Third-party pass-through plus service fee. Explicit candidate consent required.' },
    { name: 'Data Migration', code: 'data-migration', price: 0, pricingUnit: 'First Agreed Import (Standard Free)', category: 'Core HR', description: 'One preformatted import is free; complex historic migration is scoped and billed separately.' },
    { name: 'Custom Integrations', code: 'custom-integrations', price: 0, pricingUnit: 'Per Integration (Quote)', category: 'Advanced', description: 'Scope and change requests signed per integration. No unlimited bespoke work.' },
];

// Matches an existing add-on by code OR name (name is unique), so re-running never duplicates or throws.
export const seedPlanAddOns = async () => {
    try {
        console.log('Upserting plan add-ons...');
        for (const addOn of planAddOns) {
            const existing = await AddOnModule.findOne({ $or: [{ code: addOn.code }, { name: addOn.name }] });
            if (existing) {
                existing.set({ ...addOn, isActive: true });
                await existing.save();
            } else {
                await AddOnModule.create({ ...addOn, isActive: true });
            }
        }
        console.log('Plan add-on seeding completed successfully!');
    } catch (error) {
        console.error('Plan add-on seeding failed:', error);
        throw error;
    }
};
