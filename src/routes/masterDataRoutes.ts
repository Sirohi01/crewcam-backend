import { Router } from 'express';
import { createDegree, createLeaveType, deleteDegree, deleteLeaveType, getDegrees, getLeaveTypes, masterHandlers, updateDegree, updateLeaveType } from '../controllers/masterDataController';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import { requireFeature } from '../middleware/featureGate';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);
router.use(requireFeature('Core HR'));

const protectRead = checkPermission('MASTER_READ');
const protectWrite = checkPermission('MASTER_WRITE');

router.get('/leave-types', protectRead, getLeaveTypes);
router.post('/leave-types', protectWrite, createLeaveType);
router.put('/leave-types/:id', protectWrite, updateLeaveType);
router.delete('/leave-types/:id', protectWrite, deleteLeaveType);

router.get('/degrees', protectRead, getDegrees);
router.post('/degrees', protectWrite, createDegree);
router.put('/degrees/:id', protectWrite, updateDegree);
router.delete('/degrees/:id', protectWrite, deleteDegree);

router.get('/shift-timings', protectRead, masterHandlers.shiftTimings.list);
router.post('/shift-timings', protectWrite, masterHandlers.shiftTimings.create);
router.put('/shift-timings/:id', protectWrite, masterHandlers.shiftTimings.update);
router.delete('/shift-timings/:id', protectWrite, masterHandlers.shiftTimings.remove);

const routes = [
  ['marks', masterHandlers.marks],
  ['levels', masterHandlers.levels],
  ['subjects', masterHandlers.subjects],
  ['policies', masterHandlers.policies],
  ['attendance-rules', masterHandlers.attendanceRules],
  ['relaxation-rules', masterHandlers.relaxationRules],
  ['leave-natures', masterHandlers.leaveNatures],
  ['bank-names', masterHandlers.bankNames],
  ['expense-heads', masterHandlers.expenseHeads],
  ['holidays', masterHandlers.holidays],
  ['statuses', masterHandlers.statuses],
  ['it-inventories', masterHandlers.itInventories],
  ['stationeries', masterHandlers.stationeries],
  ['providers', masterHandlers.providers],
  ['brands', masterHandlers.brands],
  ['services', masterHandlers.services],
  ['mobile-services', masterHandlers.mobileServices],
  ['utility-providers', masterHandlers.utilityProviders],
  ['question-papers', masterHandlers.questionPapers],
  ['option-questions', masterHandlers.optionQuestions],
] as const;

routes.forEach(([path, handler]) => {
  router.get(`/${path}`, protectRead, handler.list);
  router.post(`/${path}`, protectWrite, handler.create);
  router.put(`/${path}/:id`, protectWrite, handler.update);
  router.delete(`/${path}/:id`, protectWrite, handler.remove);
});

export default router;
