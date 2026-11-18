import { Package } from '../models/Package';

// Plans per Crewcam_Recommended_Packages_Profit_Model.xlsx ("01 PACKAGE CARD", "02 FEATURE MATRIX",
// "09 FINAL SALES POLICY"): Free (optional) -> Essential -> Growth -> Business -> Enterprise, priced per
// employee/month, billed on the greater of actual headcount or minBilledEmployees, GST extra.
// Module names on the cards follow the "Choose the Right HRMS Plan" design; the text after " - " is the
// matrix entitlement and only shows on the plan-features page (cards render the part before " - ").
// commercialTerms are the per-plan rows of sheet "09 FINAL SALES POLICY". The previous seed is kept in seedPackages.backup.ts.

// features[] holds ONLY the default modules (isDefaultModule) and addOnModules[] the optional ones a plan includes — that is
// how the plan builder decides which "Select Features & Modules" toggles are on. A purchasable-but-not-included module
// (e.g. GPS on Essential) is simply absent from both.
// Real PlatformModule catalog ids (platformmodules collection) mixed into features[] /
// addOnModules[] alongside the human-readable bullets below, so the "Select Features &
// Modules" toggle state in the plan builder (create-subscription/page.tsx) and
// requireFeature() gating (featureGate.ts) both correctly reflect each plan — see
// featureKeys.ts's expandFeatureEntries, which already supports this mix.
const MOD = {
    employeeMgmt: '6ae9add227432d00ef9eab12',
    attendanceMgmt: '6ae9add327432d00ef9eab14',
    leaveMgmt: '6ae9add327432d00ef9eab15',
    documentMgmt: '6ae9add327432d00ef9eab16',
    ess: '6ae9add327432d00ef9eab17',
    fieldTracking: '6ae9add327432d00ef9eab18',
    timesheetMgmt: '6ae9add427432d00ef9eab1a',
    assetMgmt: '6ae9add427432d00ef9eab1b',
    recruitmentAts: '6ae9add427432d00ef9eab1c',
    performancePms: '6ae9add427432d00ef9eab1d',
    lms: '6ae9add427432d00ef9eab1e',
    payrollMgmt: '6ae9add427432d00ef9eab1f',
    expenseMgmt: '6ae9add427432d00ef9eab20',
    complianceStatutory: '6ae9add427432d00ef9eab21',
    reportsAnalytics: '6ae9add527432d00ef9eab22',
};
const CORE_DEFAULT_MODULES = [MOD.employeeMgmt, MOD.attendanceMgmt, MOD.leaveMgmt, MOD.documentMgmt, MOD.ess];
// Free Workspace: directory + leave + basic ESS only — no payroll (matrix column "Free").
const CORE_DEFAULT_MODULES_FREE = [MOD.employeeMgmt, MOD.leaveMgmt, MOD.documentMgmt, MOD.ess];

// Limits the Excel does not specify are carried over unchanged from the previous seed.
const COMMON = {
    priceUSD: 0,
    setupFeeINR: 0,
    setupFeeUSD: 0,
    freeAiCredits: 0,
    aiCreditTopUpPriceINR: 0,
    aiCreditTopUpPriceUSD: 0,
    aiFeaturesIncluded: [] as string[],
    maxGeofenceRadiusMeters: 200,
    monthlyOtpPerUser: 5,
    monthlyWhatsappAlertsPerUser: 10,
    storageLimitGB: 10,
    auditLogRetentionDays: 90,
    isActive: true,
};

const defaultPackages = [
    {
        ...COMMON,
        name: 'Free',
        tier: 'FREE',
        description: 'Free workspace - employee directory, leave and basic ESS for up to 10 employees.',
        planCode: 'FREE01',
        planBadge: '',
        displayOrder: 0,
        maxCompanies: 1,
        maxBranches: 1,
        maxDepartments: 5,
        maxDesignations: 10,
        maxUsers: 10,
        minBilledEmployees: 0,
        features: [
            'Employee Management (Core HR) - basic employee master and org structure',
            'Leave & Holidays - basic leave and holiday calendar',
            'Employee Self Service (ESS) - basic ESS / mobile',
            'Letters & Document Vault - basic',
            ...CORE_DEFAULT_MODULES_FREE,
        ],
        addOnModules: [],
        targetAudience: ['Lead generation, up to 10 employees'],
        priceINR: 0,
        pricePerUserMonthlyINR: 0,
        pricePerUserMonthlyUSD: 0,
        pricePerUserYearlyINR: 0,
        pricePerUserYearlyUSD: 0,
        geoTrackingEnabled: false,
        faceAttendance: false,
        storageLimitGB: 5,
    },
    {
        ...COMMON,
        name: 'Essential',
        tier: 'STARTER',
        description: 'Core HR made simple',
        planCode: 'STR01',
        planBadge: '',
        displayOrder: 1,
        maxCompanies: 1,
        maxBranches: 1,
        maxDepartments: 5,
        maxDesignations: 10,
        maxUsers: 9999,
        minBilledEmployees: 35,
        features: [
            'Employee Management (Core HR) - full employee master and org structure, basic onboarding / exit and F&F, letters and document vault',
            'Leave & Attendance (Basic) - full leave and holiday calendar, basic shift / biometric integration; GPS and geofence punch is an add-on',
            'Payroll & Compliance (Statutory) - core payroll with PF / ESI / PT / TDS',
            'Employee Self Service (ESS) - employee ESS and mobile app; WhatsApp utility notifications metered add-on, AI policy assistant limited trial',
            'Reports & Dashboards (Basic) - standard reports and standard compliance reports',
            ...CORE_DEFAULT_MODULES,
        ],
        // 'ai-employee-summary' is the literal key requireFeature() checks.
        addOnModules: ['ai-assist', 'ai-employee-summary', MOD.payrollMgmt, MOD.complianceStatutory, MOD.reportsAnalytics],
        targetAudience: ['Budget SMB / office payroll', 'Up to 100 employees'],
        commercialTerms: [
            { label: 'Minimum monthly subscription', value: '₹2,415 (₹69 x 35 employees)' },
            { label: 'Billing basis', value: 'Greater of actual active billed headcount or contracted minimum' },
            { label: 'Taxes', value: 'GST extra as applicable' },
            { label: 'Payment frequency', value: 'Monthly in advance; annual option' },
            { label: 'Annual discount', value: '10%, prepaid' },
            { label: 'Trial', value: '14 days, without automatic paid activation' },
            { label: 'Setup / migration', value: 'Standard self-onboarding included; assisted onboarding quoted' },
            { label: 'Support', value: 'Knowledge base + email' },
            { label: 'GPS / WhatsApp / AI', value: 'Paid or quota-based only' },
            { label: 'Additional users', value: 'Same rate per additional billed employee' },
            { label: 'Data storage / API', value: 'Reasonable use; advanced API excluded' },
            { label: 'Positioning', value: 'Transparent HR + payroll' },
        ],
        priceINR: 69,
        pricePerUserMonthlyINR: 69,
        pricePerUserMonthlyUSD: 0.82,
        // 12 months prepaid with the 10% annual discount (sheet 09), rounded.
        pricePerUserYearlyINR: 745,
        pricePerUserYearlyUSD: 8.82,
        geoTrackingEnabled: false,
        faceAttendance: false,
    },
    {
        ...COMMON,
        name: 'Growth',
        tier: 'GROWTH',
        description: 'Manage people, time and operations better',
        planCode: 'GRW01',
        planBadge: 'Best Seller',
        displayOrder: 2,
        maxCompanies: 1,
        maxBranches: 3,
        maxDepartments: 10,
        maxDesignations: 20,
        maxUsers: 9999,
        minBilledEmployees: 35,
        features: [
            'Everything in Essential, plus - WhatsApp utility notifications with a quota of 100 messages per tenant',
            'Geo-attendance & Mobile App - GPS and geofence punch included (quota); selfie / face liveness is an add-on',
            'Shift & Roster Management - advanced shifts',
            'Onboarding & Employee Lifecycle - advanced onboarding, exit and F&F; helpdesk and approvals',
            'Expense & Reimbursement - expenses and travel claims',
            'Advanced Reports & Analytics - expanded analytics, compliance review dashboard; AI policy assistant fair-use basic',
            ...CORE_DEFAULT_MODULES,
        ],
        // 'ai-employee-summary' / 'Helpdesk' are the literal keys requireFeature() checks.
        addOnModules: ['ai-assist', 'ai-hire', 'ai-employee-summary', 'Helpdesk', MOD.payrollMgmt, MOD.complianceStatutory, MOD.reportsAnalytics, MOD.fieldTracking, MOD.expenseMgmt],
        targetAudience: ['Most popular', 'Field and multi-site teams'],
        commercialTerms: [
            { label: 'Minimum monthly subscription', value: '₹3,465 (₹99 x 35 employees)' },
            { label: 'Billing basis', value: 'Greater of actual active billed headcount or contracted minimum' },
            { label: 'Taxes', value: 'GST extra as applicable' },
            { label: 'Payment frequency', value: 'Monthly in advance; annual option' },
            { label: 'Annual discount', value: '10%, prepaid' },
            { label: 'Trial', value: '14 days' },
            { label: 'Setup / migration', value: 'Basic guided setup included within fair-use limits' },
            { label: 'Support', value: 'Ticket support' },
            { label: 'GPS / WhatsApp / AI', value: 'Quota-based GPS; WhatsApp basic alerts subject to fair use' },
            { label: 'Additional users', value: 'Same rate per additional billed employee' },
            { label: 'Data storage / API', value: 'Reasonable use; advanced API excluded' },
            { label: 'Positioning', value: 'Flagship field workforce value' },
        ],
        priceINR: 99,
        pricePerUserMonthlyINR: 99,
        pricePerUserMonthlyUSD: 1.17,
        pricePerUserYearlyINR: 1069,
        pricePerUserYearlyUSD: 12.65,
        geoTrackingEnabled: true,
        faceAttendance: false,
    },
    {
        ...COMMON,
        name: 'Business',
        tier: 'PRO',
        description: 'Build a high-performance workforce',
        planCode: 'PRO01',
        planBadge: '',
        displayOrder: 3,
        maxCompanies: 2,
        maxBranches: 5,
        maxDepartments: 15,
        maxDesignations: 30,
        maxUsers: 9999,
        minBilledEmployees: 50,
        features: [
            'Everything in Growth, plus - WhatsApp utility notifications with a quota of 250 messages per tenant, priority ticket support',
            'Performance Management (KRA/KPI) - performance and engagement',
            'Recruitment / ATS - basic hiring workflow (without voice interviews); basic contract worker register',
            'Asset & Inventory Management - asset register and timesheets',
            'Employee Engagement & Surveys - engagement surveys and pulse',
            'Advanced Analytics & Custom Reports - advanced analytics and compliance dashboard',
            ...CORE_DEFAULT_MODULES,
        ],
        addOnModules: ['ai-assist', 'ai-hire', 'ai-employee-summary', 'ai-hiring', 'Helpdesk', 'Assets', MOD.payrollMgmt, MOD.complianceStatutory, MOD.reportsAnalytics, MOD.fieldTracking, MOD.expenseMgmt, MOD.assetMgmt, MOD.timesheetMgmt, MOD.performancePms, MOD.recruitmentAts],
        targetAudience: ['HR teams scaling operations', 'Performance-led teams'],
        commercialTerms: [
            { label: 'Minimum monthly subscription', value: '₹7,450 (₹149 x 50 employees)' },
            { label: 'Billing basis', value: 'Greater of actual active billed headcount or contracted minimum' },
            { label: 'Taxes', value: 'GST extra as applicable' },
            { label: 'Payment frequency', value: 'Monthly in advance; annual or custom quote' },
            { label: 'Annual discount', value: '10%, prepaid' },
            { label: 'Trial', value: '14 days where feasible' },
            { label: 'Setup / migration', value: 'Complex migration / custom implementation quoted' },
            { label: 'Support', value: 'Priority ticket / agreed SLA' },
            { label: 'GPS / WhatsApp / AI', value: 'Quota-based; custom / advanced usage chargeable' },
            { label: 'Additional users', value: 'Same rate per additional billed employee' },
            { label: 'Data storage / API', value: 'Reasonable use; custom API charges may apply' },
            { label: 'Positioning', value: 'Integrated HR operations' },
        ],
        priceINR: 149,
        pricePerUserMonthlyINR: 149,
        pricePerUserMonthlyUSD: 1.76,
        pricePerUserYearlyINR: 1609,
        pricePerUserYearlyUSD: 19.04,
        geoTrackingEnabled: true,
        faceAttendance: false,
    },
    {
        ...COMMON,
        name: 'Enterprise',
        tier: 'ENTERPRISE',
        description: 'Enterprise-grade HRMS for large teams',
        planCode: 'ENT01',
        planBadge: '',
        displayOrder: 4,
        maxCompanies: 5,
        maxBranches: 10,
        maxDepartments: 20,
        maxDesignations: 50,
        maxUsers: 9999,
        minBilledEmployees: 200,
        features: [
            'Everything in Business, plus - advanced payroll rules and recruitment workflow, advanced contract workforce configuration, custom compliance controls, WhatsApp agreed pool, AI agreed credits',
            'Custom Workflows & Approvals - advanced workflows and multi-entity controls',
            'Single Sign-On (SSO) & Role Management - scoped access',
            'API Integrations (ERP, Finance, etc.) - scoped API and webhooks access',
            'Learning Management System (LMS) - courses, quizzes, certificates',
            'Dedicated Account Manager & Priority Support - named success contact (scope-based)',
            ...CORE_DEFAULT_MODULES,
        ],
        addOnModules: ['ai-assist', 'ai-hire', 'ai-employee-summary', 'ai-hiring', 'Helpdesk', 'Assets', MOD.payrollMgmt, MOD.complianceStatutory, MOD.reportsAnalytics, MOD.fieldTracking, MOD.expenseMgmt, MOD.assetMgmt, MOD.timesheetMgmt, MOD.performancePms, MOD.recruitmentAts, MOD.lms],
        targetAudience: ['200+ employees', 'Multi-entity organizations'],
        commercialTerms: [
            { label: 'Minimum monthly subscription', value: 'From ₹39,800 (₹199 x 200 employees)' },
            { label: 'Billing basis', value: 'Greater of actual active billed headcount or contracted minimum' },
            { label: 'Taxes', value: 'GST extra as applicable' },
            { label: 'Payment frequency', value: 'Monthly in advance; annual or custom quote' },
            { label: 'Annual discount', value: '10%, prepaid; approval-based' },
            { label: 'Trial', value: 'Enterprise demo / POC' },
            { label: 'Setup / migration', value: 'Complex migration / custom implementation quoted (onboarding fee ₹15,000)' },
            { label: 'Support', value: 'Enterprise scoped' },
            { label: 'GPS / WhatsApp / AI', value: 'Quota-based; custom / advanced usage chargeable' },
            { label: 'Additional users', value: 'Same rate, unless enterprise volume quote' },
            { label: 'Data storage / API', value: 'Reasonable use; custom API charges may apply' },
            { label: 'Positioning', value: 'Enterprise tailor-made' },
        ],
        priceINR: 199,
        pricePerUserMonthlyINR: 199,
        pricePerUserMonthlyUSD: 2.36,
        pricePerUserYearlyINR: 2149,
        pricePerUserYearlyUSD: 25.43,
        // Enterprise onboarding fee (sheet 03): quoted, waive only with approval.
        setupFeeINR: 15000,
        setupFeeUSD: 178,
        geoTrackingEnabled: true,
        faceAttendance: false,
    },
];

// Upserts by planCode instead of wiping the collection — a prior deleteMany({}) +
// insertMany() here would generate fresh _ids on every run, silently orphaning every
// tenant's Tenant.packageId (see superAdminController.ts/companyWizardController.ts,
// which store the Package _id directly).
export const seedPackages = async () => {
    try {
        console.log('Upserting default packages...');
        for (const pkg of defaultPackages) {
            await Package.updateOne({ planCode: pkg.planCode }, { $set: pkg }, { upsert: true });
        }
        console.log('Package seeding completed successfully!');
    } catch (error) {
        console.error('Package seeding failed:', error);
        throw error;
    }
};
