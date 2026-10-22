import { Router } from 'express';
import {
  createFeature, createPackage, createPermission, createTenant, deleteFeature, deleteTenant, getAiUsageLogs,
  getAllFeatures, getAllPackages, getAllPermissions, getAllTenants, getTenantById, getTenantDashboardStats, updateFeature, updatePackage, updateTenant,
  resendCredentials, topUpAiCredits, markSetupFeePaid, recordSubscriptionPayment,
  resendCompanyCredentials, getNextCorporateId,
  getTenantRoles, getTenantAdmins, getTenantEmployees, inviteTenantAdmin, updateTenantAdmin, deleteTenantAdmin, deleteTenantEmployee, updateTenantEmployee, bulkImportEmployees, getSuperAdminActivityLogs, sendDeleteCompanyOtp, sendWizardOtp, verifyWizardOtp
} from '../controllers/superAdminController';
import { getAllAiProviders, configureAiProvider } from '../controllers/platformAiController';
import { getPlatformDashboardStats, getPlatformAuditLogs, getPlatformTickets } from '../controllers/platformController';
import { getAllLeads, getLeadById, getPipelineSummary, createLead, updateLead, deleteLead, listLeadProposals, generateLeadProposal, sendLeadProposal, addLeadNote, getLeadMasterData, createLeadMasterData, updateLeadMasterData, deleteLeadMasterData, getAssignableUsers, getLeadStats, bulkImportLeads, getFollowUpStats, getReminderSettings, updateReminderSettings, sendLeadEmail, getHotLeadStats } from '../controllers/leadController';
import { getOnboardingTasks, createOnboardingTask, updateOnboardingTask, deleteOnboardingTask } from '../controllers/onboardingTaskController';
import { getReportsSummary } from '../controllers/reportsController';
import { listAllInvoices, listAllPayments, generateQuotation, listQuotations, sendQuotation, generateInvoice, listInvoicesForTenant, sendInvoice, createCheckoutSession, setInvoiceStatus } from '../controllers/billingController';
import { changePlan } from '../controllers/changePlanController';
import { getAllCoupons, createCoupon, updateCoupon, deleteCoupon } from '../controllers/couponController';
import { createCompanyDraft } from '../controllers/companyWizardController';
import { getLifecycleTimeline, advanceLifecycle, setLifecycleStatus, provisionWorkspace } from '../controllers/companyLifecycleController';
import { getAllBanners, createBanner, updateBanner, deleteBanner } from '../controllers/bannerController';
import { getAutomationRules, updateAutomationRule, getAutomationLogs, runAutomationNow } from '../controllers/automationController';
import { getAllIndustries, createIndustry, updateIndustry, deleteIndustry } from '../controllers/dropdowns/industryController';
import { getAllCompanySizes, createCompanySize, updateCompanySize, deleteCompanySize } from '../controllers/dropdowns/companySizeController';
import { getAllTimeZones, createTimeZone, updateTimeZone, deleteTimeZone } from '../controllers/dropdowns/timeZoneController';
import { getAllCurrencys, createCurrency, updateCurrency, deleteCurrency } from '../controllers/dropdowns/currencyController';
import { getAllBillingCycles, createBillingCycle, updateBillingCycle, deleteBillingCycle } from '../controllers/dropdowns/billingCycleController';
import { getAllAdvancePayments, createAdvancePayment, updateAdvancePayment, deleteAdvancePayment } from '../controllers/dropdowns/advancePaymentController';
import { getAllGSTTreatments, createGSTTreatment, updateGSTTreatment, deleteGSTTreatment } from '../controllers/dropdowns/gstTreatmentController';
import { getAllFinancialYears, createFinancialYear, updateFinancialYear, deleteFinancialYear } from '../controllers/dropdowns/financialYearController';
import { getAllWeekStartsOns, createWeekStartsOn, updateWeekStartsOn, deleteWeekStartsOn } from '../controllers/dropdowns/weekStartsOnController';
import { getAllDateFormats, createDateFormat, updateDateFormat, deleteDateFormat } from '../controllers/dropdowns/dateFormatController';
import { getAllTimeFormats, createTimeFormat, updateTimeFormat, deleteTimeFormat } from '../controllers/dropdowns/timeFormatController';
import { getAllFirstDayOfMonths, createFirstDayOfMonth, updateFirstDayOfMonth, deleteFirstDayOfMonth } from '../controllers/dropdowns/firstDayOfMonthController';
import { getAllNumberFormats, createNumberFormat, updateNumberFormat, deleteNumberFormat } from '../controllers/dropdowns/numberFormatController';
import { getAllLeaveYearStartMonths, createLeaveYearStartMonth, updateLeaveYearStartMonth, deleteLeaveYearStartMonth } from '../controllers/dropdowns/leaveYearStartMonthController';
import { getAllPreferredLanguages, createPreferredLanguage, updatePreferredLanguage, deletePreferredLanguage } from '../controllers/dropdowns/preferredLanguageController';
import { authenticate } from '../middleware/auth';
import { checkPermission } from '../middleware/rbac';

const router = Router();
router.use(authenticate);
router.use(checkPermission('SUPER_ADMIN'));

router.get('/dashboard-stats', getPlatformDashboardStats);
router.get('/audit-logs', getPlatformAuditLogs);
router.get('/activity-logs', getSuperAdminActivityLogs);
router.get('/tickets', getPlatformTickets);
router.get('/reports/summary', getReportsSummary);

router.get('/next-corporate-id', getNextCorporateId);
router.get('/tenants', getAllTenants);
router.get('/tenants/:id', getTenantById);
router.get('/tenants/:id/dashboard-stats', getTenantDashboardStats);
router.post('/tenants', createTenant);
router.put('/tenants/:id', updateTenant);
router.get('/tenants/:id/roles', getTenantRoles);
router.get('/tenants/:id/admins', getTenantAdmins);
router.get('/tenants/:id/employees', getTenantEmployees);
router.post('/tenants/:id/admins/invite', inviteTenantAdmin);
router.put('/tenants/:id/admins/:adminId', updateTenantAdmin);
router.delete('/tenants/:id/admins/:adminId', deleteTenantAdmin);
router.put('/tenants/:id/employees/:employeeId', updateTenantEmployee);
router.delete('/tenants/:id/employees/:employeeId', deleteTenantEmployee);
router.post('/tenants/:id/employees/bulk', bulkImportEmployees);
router.post('/tenants/:id/delete-otp', sendDeleteCompanyOtp);
router.delete('/tenants/:id', deleteTenant);
router.post('/tenants/:id/resend-credentials', resendCredentials);
router.post('/tenants/:id/topup-ai-credits', topUpAiCredits);
router.post('/tenants/:id/mark-setup-fee-paid', markSetupFeePaid);
router.post('/tenants/:id/record-subscription-payment', recordSubscriptionPayment);
router.post('/tenants/:id/change-plan', changePlan);
router.get('/tenants/:id/lifecycle', getLifecycleTimeline);
router.post('/tenants/:id/lifecycle', setLifecycleStatus);
router.post('/tenants/:id/lifecycle/advance', advanceLifecycle);
router.post('/tenants/:id/lifecycle/provision-workspace', provisionWorkspace);
router.get('/tenants/:id/quotations', listQuotations);
router.post('/tenants/:id/quotations', generateQuotation);
router.get('/tenants/:id/invoices', listInvoicesForTenant);
router.post('/tenants/:id/invoices', generateInvoice);

router.post('/companies/wizard', createCompanyDraft);
router.post('/wizard-otp/send', sendWizardOtp);
router.post('/wizard-otp/verify', verifyWizardOtp);

router.get('/packages', getAllPackages);
router.post('/packages', createPackage);
router.put('/packages/:id', updatePackage);

router.get('/permissions', getAllPermissions);
router.post('/permissions', createPermission);

router.get('/features', getAllFeatures);
router.post('/features', createFeature);
router.put('/features/:id', updateFeature);
router.delete('/features/:id', deleteFeature);

router.get('/ai-usage-logs', getAiUsageLogs);
router.get('/ai-providers', getAllAiProviders);
router.put('/ai-providers', configureAiProvider);

router.get('/leads', getAllLeads);
router.get('/leads/pipeline-summary', getPipelineSummary);
router.get('/leads/stats', getLeadStats);
router.get('/leads/follow-ups/stats', getFollowUpStats);
router.get('/leads/hot/stats', getHotLeadStats);
router.get('/leads/reminder-settings', getReminderSettings);
router.put('/leads/reminder-settings', updateReminderSettings);
router.get('/leads/master-data', getLeadMasterData);
router.post('/leads/master-data', createLeadMasterData);
router.put('/leads/master-data/:id', updateLeadMasterData);
router.delete('/leads/master-data/:id', deleteLeadMasterData);
router.get('/leads/assignable-users', getAssignableUsers);
router.post('/leads/import', bulkImportLeads);
router.get('/leads/:id', getLeadById);
router.post('/leads', createLead);
router.put('/leads/:id', updateLead);
router.delete('/leads/:id', deleteLead);
router.get('/leads/:id/proposals', listLeadProposals);
router.post('/leads/:id/proposals', generateLeadProposal);
router.post('/leads/:id/proposals/:proposalId/send', sendLeadProposal);
router.post('/leads/:id/notes', addLeadNote);
router.post('/leads/:id/send-email', sendLeadEmail);

router.get('/onboarding-tasks', getOnboardingTasks);
router.post('/onboarding-tasks', createOnboardingTask);
router.put('/onboarding-tasks/:id', updateOnboardingTask);
router.delete('/onboarding-tasks/:id', deleteOnboardingTask);

router.get('/invoices', listAllInvoices);
router.post('/invoices/:id/send', sendInvoice);
router.post('/invoices/:id/checkout-session', createCheckoutSession);
router.put('/invoices/:id/status', setInvoiceStatus);
router.get('/payments', listAllPayments);

router.post('/quotations/:id/send', sendQuotation);

router.get('/coupons', getAllCoupons);
router.post('/coupons', createCoupon);
router.put('/coupons/:id', updateCoupon);
router.delete('/coupons/:id', deleteCoupon);

router.get('/banners', getAllBanners);
router.post('/banners', createBanner);
router.put('/banners/:id', updateBanner);
router.delete('/banners/:id', deleteBanner);

router.get('/automation/rules', getAutomationRules);
router.put('/automation/rules/:type', updateAutomationRule);
router.get('/automation/logs', getAutomationLogs);
router.post('/automation/run', runAutomationNow);

// Dropdowns
router.get('/industries', getAllIndustries);
router.post('/industries', createIndustry);
router.put('/industries/:id', updateIndustry);
router.delete('/industries/:id', deleteIndustry);

router.get('/company-sizes', getAllCompanySizes);
router.post('/company-sizes', createCompanySize);
router.put('/company-sizes/:id', updateCompanySize);
router.delete('/company-sizes/:id', deleteCompanySize);

router.get('/time-zones', getAllTimeZones);
router.post('/time-zones', createTimeZone);
router.put('/time-zones/:id', updateTimeZone);
router.delete('/time-zones/:id', deleteTimeZone);


router.get('/currencys', getAllCurrencys);
router.post('/currencys', createCurrency);
router.put('/currencys/:id', updateCurrency);
router.delete('/currencys/:id', deleteCurrency);

router.get('/billing-cycles', getAllBillingCycles);
router.post('/billing-cycles', createBillingCycle);
router.put('/billing-cycles/:id', updateBillingCycle);
router.delete('/billing-cycles/:id', deleteBillingCycle);

router.get('/advance-payments', getAllAdvancePayments);
router.post('/advance-payments', createAdvancePayment);
router.put('/advance-payments/:id', updateAdvancePayment);
router.delete('/advance-payments/:id', deleteAdvancePayment);


router.get('/gst-treatments', getAllGSTTreatments);
router.post('/gst-treatments', createGSTTreatment);
router.put('/gst-treatments/:id', updateGSTTreatment);
router.delete('/gst-treatments/:id', deleteGSTTreatment);

router.get('/financial-years', getAllFinancialYears);
router.post('/financial-years', createFinancialYear);
router.put('/financial-years/:id', updateFinancialYear);
router.delete('/financial-years/:id', deleteFinancialYear);

router.get('/week-starts-ons', getAllWeekStartsOns);
router.post('/week-starts-ons', createWeekStartsOn);
router.put('/week-starts-ons/:id', updateWeekStartsOn);
router.delete('/week-starts-ons/:id', deleteWeekStartsOn);

router.get('/date-formats', getAllDateFormats);
router.post('/date-formats', createDateFormat);
router.put('/date-formats/:id', updateDateFormat);
router.delete('/date-formats/:id', deleteDateFormat);

router.get('/time-formats', getAllTimeFormats);
router.post('/time-formats', createTimeFormat);
router.put('/time-formats/:id', updateTimeFormat);
router.delete('/time-formats/:id', deleteTimeFormat);

router.get('/first-day-of-months', getAllFirstDayOfMonths);
router.post('/first-day-of-months', createFirstDayOfMonth);
router.put('/first-day-of-months/:id', updateFirstDayOfMonth);
router.delete('/first-day-of-months/:id', deleteFirstDayOfMonth);

router.get('/number-formats', getAllNumberFormats);
router.post('/number-formats', createNumberFormat);
router.put('/number-formats/:id', updateNumberFormat);
router.delete('/number-formats/:id', deleteNumberFormat);

router.get('/leave-year-start-months', getAllLeaveYearStartMonths);
router.post('/leave-year-start-months', createLeaveYearStartMonth);
router.put('/leave-year-start-months/:id', updateLeaveYearStartMonth);
router.delete('/leave-year-start-months/:id', deleteLeaveYearStartMonth);

router.get('/preferred-languages', getAllPreferredLanguages);
router.post('/preferred-languages', createPreferredLanguage);
router.put('/preferred-languages/:id', updatePreferredLanguage);
router.delete('/preferred-languages/:id', deletePreferredLanguage);

export default router;
