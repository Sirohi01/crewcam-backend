import { Router } from 'express';
import {
  createFeature, createPackage, createPermission, createTenant, deleteFeature, deleteTenant, getAiUsageLogs,
  getAllFeatures, getAllPackages, getAllPermissions, getAllTenants, updateFeature, updatePackage, updateTenant,
  resendCredentials, topUpAiCredits, markSetupFeePaid, recordSubscriptionPayment,
  getDashboardStats,
  getAllAuditLogsAcrossTenants,
  getAllPayments,
  getAllTicketsAcrossTenants,
  getPackageById,
  resendCompanyCredentials,
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
import { authenticate } from '../middleware/auth';
import { checkPermission } from '../middleware/rbac';

const router = Router();
router.use(authenticate);
router.use(checkPermission('SUPER_ADMIN'));

router.get('/dashboard-stats', getPlatformDashboardStats);
router.get('/audit-logs', getPlatformAuditLogs);
router.get('/tickets', getPlatformTickets);
router.get('/reports/summary', getReportsSummary);

router.get('/tenants', getAllTenants);
router.post('/tenants', createTenant);
router.post('/companies/wizard', createCompanyDraft);
router.put('/tenants/:id', updateTenant);
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

router.post('/tenants/:id/resend-credentials', resendCompanyCredentials);
router.post('/tenants/:id/mark-setup-fee-paid', markSetupFeePaid);
router.post('/tenants/:id/record-subscription-payment', recordSubscriptionPayment);
router.post('/tenants/:id/topup-ai-credits', topUpAiCredits);
router.get('/tenants/:id/lifecycle', getLifecycleTimeline);
router.post('/tenants/:id/lifecycle/advance', advanceLifecycle);
router.post('/tenants/:id/lifecycle', setLifecycleStatus);
router.post('/tenants/:id/provision-workspace', provisionWorkspace);
router.get('/packages', getAllPackages);
router.get('/packages/:id', getPackageById);
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
router.get('/dashboard-stats', getDashboardStats);
router.get('/audit-logs', getAllAuditLogsAcrossTenants);
router.get('/payments', getAllPayments);
router.get('/tickets', getAllTicketsAcrossTenants);
router.get('/leads', getAllLeads);
router.get('/leads/pipeline-summary', getPipelineSummary);
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

router.get('/reports/summary', getReportsSummary);
router.get('/tenants/:id/quotations', listQuotations);
router.post('/tenants/:id/quotations', generateQuotation);
router.post('/quotations/:id/send', sendQuotation);
router.get('/tenants/:id/invoices', listInvoicesForTenant);
router.post('/tenants/:id/invoices', generateInvoice);
router.get('/invoices', listAllInvoices);
router.post('/invoices/:id/send', sendInvoice);
router.post('/invoices/:id/checkout', createCheckoutSession);
router.post('/invoices/:id/status', setInvoiceStatus);
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
router.post('/tenants/:id/change-plan', changePlan);

export default router;
