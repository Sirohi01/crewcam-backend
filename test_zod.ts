import { z } from 'zod';

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const createTenantSchema = z.object({
  name: z.string().trim().min(2, 'Company name must be at least 2 characters'),
  packageId: z.string().min(1, 'A subscription package must be selected'),
  aiCredits: z.coerce.number().min(0).optional().default(0),
  adminFirstName: z.string().trim().min(1, 'Admin first name is required'),
  adminLastName: z.string().trim().min(1, 'Admin last name is required'),
  adminEmail: z.string().trim().email('A valid admin email is required'),
  adminPassword: passwordSchema,
  adminDesignation: z.string().optional(),
  adminPhone: z.string().optional(),
  country: z.string().trim().min(1).default('India'),
  tradeName: z.string().optional(),
  industry: z.string().optional(),
  companyType: z.string().optional(),
  website: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  timezone: z.string().optional(),
  baseCurrency: z.string().optional(),
  financialYearStartMonth: z.coerce.number().optional(),
  panNumber: z.string().optional(),
  gstin: z.string().optional(),
  cin: z.string().optional(),
  tan: z.string().optional(),
  epfoNumber: z.string().optional(),
  esicNumber: z.string().optional(),
  ptNumber: z.string().optional(),
  lwfNumber: z.string().optional(),
  tin: z.string().optional(),
  ein: z.string().optional(),
  vatNumber: z.string().optional(),
  businessLicenseNumber: z.string().optional(),
  logoUrl: z.string().optional(),
  adminProfilePictureUrl: z.string().optional(),
  setupFeeAmount: z.coerce.number().min(0).optional().default(0),
  setupFeeCurrency: z.enum(['INR', 'USD']).optional().default('INR'),
  setupFeeStatus: z.enum(['PENDING', 'PAID', 'WAIVED']).optional().default('PENDING'),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).optional().default('MONTHLY'),
  subscriptionAmount: z.coerce.number().min(0).optional().default(0),
  subscriptionCurrency: z.enum(['INR', 'USD']).optional().default('INR'),
  estimatedEmployees: z.coerce.number().min(0).optional(),

  corporateId: z.string().trim().optional(),
  companySize: z.string().optional(),
  description: z.string().optional(),
  incorporationDate: z.coerce.date().optional(),
  alternateEmail: z.string().optional(),
  whatsappNumber: z.string().optional(),
  preferredLanguage: z.string().optional(),
  supportEmail: z.string().optional(),
  supportPhone: z.string().optional(),
  linkedInUrl: z.string().optional(),
  selectedModules: z.array(z.string()).optional(),
  addonModules: z.array(z.string()).optional(),
  documents: z.object({
    incorporationCertUrl: z.string().optional(),
    gstCertUrl: z.string().optional(),
    panCardUrl: z.string().optional(),
    otherDocumentUrl: z.string().optional(),
  }).optional(),
  notificationPreferences: z.object({
    biometric: z.boolean().optional(),
    sso: z.boolean().optional(),
    sms: z.boolean().optional(),
    geoTracking: z.boolean().optional(),
    email: z.boolean().optional(),
    whatsapp: z.boolean().optional(),
  }).optional(),
  weekStartsOn: z.string().optional(),
  dateFormat: z.string().optional(),
  timeFormat: z.string().optional(),
  numberFormat: z.string().optional(),
  leaveYearStartMonth: z.coerce.number().optional(),
});

const updateTenantSchema = createTenantSchema.partial().extend({
  isActive: z.coerce.boolean().optional(),
  setupFeeStatus: z.enum(['PENDING', 'PAID', 'WAIVED']).optional(),
  subscriptionStatus: z.enum(['ACTIVE', 'PENDING', 'PAST_DUE', 'CANCELLED']).optional(),
  lifecycleStatus: z.enum(['LEAD', 'DEMO_SCHEDULED', 'PROPOSAL_SENT', 'QUOTATION_APPROVED',
    'SUBSCRIPTION_PENDING', 'SUBSCRIPTION_PAID', 'SETUP_FEE_PENDING', 'SETUP_FEE_PAID',
    'IMPLEMENTATION_IN_PROGRESS', 'WORKSPACE_PROVISIONING', 'CONFIGURATION', 'QA_VERIFICATION',
    'ADMIN_CREDENTIALS_GENERATED', 'ACTIVATION_PENDING', 'ACTIVE', 'LIVE', 'SUSPENDED', 'EXPIRED', 'CLOSED']).optional(),
  modules: z.array(z.object({ key: z.string(), enabled: z.boolean() })).optional(),
  preferences: z.array(z.object({ key: z.string(), enabled: z.boolean() })).optional(),
  payrollSetup: z.any().optional(),
});

const payload = {
  modules: [
    { key: "employee-mgmt", enabled: true }
  ],
  preferences: [
    { key: "biometric", enabled: true }
  ],
  lifecycleStatus: "CONFIGURATION"
};

const result = updateTenantSchema.safeParse(payload);
console.log(JSON.stringify(result, null, 2));
