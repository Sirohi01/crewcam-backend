import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Package } from './src/models/Package';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/namoCrewcam';

const defaultPackages = [
    {
        name: 'Starter',
        tier: 'BASIC',
        description: 'Perfect for small teams getting started',
        planCode: 'STR01',
        planBadge: '',
        displayOrder: 1,
        maxCompanies: 1,
        maxBranches: 1,
        maxDepartments: 5,
        maxDesignations: 10,
        maxUsers: 50,
        features: [
            'Core HR & Employee Profile',
            'Leave Management',
            'Attendance (Basic)',
            'Mobile App Access',
            'Email Support'
        ],
        targetAudience: ['Small Teams'],
        priceINR: 89,
        priceUSD: 0,
        pricePerUserMonthlyINR: 89,
        pricePerUserMonthlyUSD: 0,
        pricePerUserYearlyINR: 890,
        pricePerUserYearlyUSD: 0,
        setupFeeINR: 0,
        setupFeeUSD: 0,
        freeAiCredits: 0,
        aiCreditTopUpPriceINR: 0,
        aiCreditTopUpPriceUSD: 0,
        isActive: true
    },
    {
        name: 'Professional',
        tier: 'PROFESSIONAL',
        description: 'Ideal for growing organizations',
        planCode: 'PRO01',
        planBadge: 'Most Popular',
        displayOrder: 2,
        maxCompanies: 1,
        maxBranches: 3,
        maxDepartments: 10,
        maxDesignations: 20,
        maxUsers: 200,
        features: [
            'All Starter Features',
            'Payroll Management',
            'Advanced Attendance',
            'Performance Management',
            'Reports & Analytics',
            'Priority Support'
        ],
        targetAudience: ['Growing Businesses'],
        priceINR: 150,
        priceUSD: 0,
        pricePerUserMonthlyINR: 150,
        pricePerUserMonthlyUSD: 0,
        pricePerUserYearlyINR: 1500,
        pricePerUserYearlyUSD: 0,
        setupFeeINR: 0,
        setupFeeUSD: 0,
        freeAiCredits: 0,
        aiCreditTopUpPriceINR: 0,
        aiCreditTopUpPriceUSD: 0,
        isActive: true
    },
    {
        name: 'Enterprise',
        tier: 'ENTERPRISE',
        description: 'Advanced features for large organizations',
        planCode: 'ENT01',
        planBadge: '',
        displayOrder: 3,
        maxCompanies: 5,
        maxBranches: 10,
        maxDepartments: 20,
        maxDesignations: 50,
        maxUsers: 9999, // Represents Unlimited
        features: [
            'All Professional Features',
            'Advanced HR Analytics',
            'Recruitment & Onboarding',
            'Asset Management',
            'Workflow Automation',
            'API Access',
            'Dedicated Support'
        ],
        targetAudience: ['Large Enterprises'],
        priceINR: 250,
        priceUSD: 0,
        pricePerUserMonthlyINR: 250,
        pricePerUserMonthlyUSD: 0,
        pricePerUserYearlyINR: 2500,
        pricePerUserYearlyUSD: 0,
        setupFeeINR: 0,
        setupFeeUSD: 0,
        freeAiCredits: 0,
        aiCreditTopUpPriceINR: 0,
        aiCreditTopUpPriceUSD: 0,
        isActive: true
    },
    {
        name: 'Custom',
        tier: 'CUSTOM',
        description: 'Tailored solution for your unique requirements',
        planCode: 'CUS01',
        planBadge: '',
        displayOrder: 4,
        maxCompanies: 9999,
        maxBranches: 9999,
        maxDepartments: 9999,
        maxDesignations: 9999,
        maxUsers: 9999, // Represents Unlimited
        features: [
            'All Enterprise Features',
            'Custom Modules',
            'Custom Integrations',
            'Dedicated Account Manager',
            'SLA & Priority Support',
            'On-premise / Private Cloud'
        ],
        targetAudience: ['Custom Requirements'],
        priceINR: 0,
        priceUSD: 0,
        pricePerUserMonthlyINR: 0,
        pricePerUserMonthlyUSD: 0,
        pricePerUserYearlyINR: 0,
        pricePerUserYearlyUSD: 0,
        setupFeeINR: 0,
        setupFeeUSD: 0,
        freeAiCredits: 0,
        aiCreditTopUpPriceINR: 0,
        aiCreditTopUpPriceUSD: 0,
        isActive: true
    }
];

const seed = async () => {
    try {
        console.log('Connecting to MongoDB...', MONGO_URI);
        await mongoose.connect(MONGO_URI);
        console.log('Connected.');
        
        console.log('Clearing existing packages...');
        await Package.deleteMany({});
        
        console.log('Inserting default packages...');
        await Package.insertMany(defaultPackages);
        
        console.log('Seeding completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    }
};

seed();
