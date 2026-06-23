import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import { requireFeature } from '../middleware/featureGate';

import {
  createAsset,
  getAssets,
  updateAsset,
  allocateAsset,
  returnAsset,
  getAllocations
} from '../controllers/assetController';

import {
  createTicket,
  getTickets,
  updateTicket
} from '../controllers/helpdeskController';

import {
  createCourse,
  getCourses,
  enrollTraining,
  getMyTrainings,
  updateTrainingProgress
} from '../controllers/lmsController';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);

// Assets
router.use('/assets', requireFeature('Assets'));
router.get('/assets', checkPermission('SUPPORT_READ'), getAssets);
router.post('/assets', checkPermission('SUPPORT_WRITE'), createAsset);
router.put('/assets/:id', checkPermission('SUPPORT_WRITE'), updateAsset);

// Asset Allocations
router.get('/assets/allocations', checkPermission('SUPPORT_READ'), getAllocations);
router.post('/assets/allocate', checkPermission('SUPPORT_WRITE'), allocateAsset);
router.post('/assets/return/:id', checkPermission('SUPPORT_WRITE'), returnAsset);

// Helpdesk Tickets
router.use('/tickets', requireFeature('Helpdesk'));
router.get('/tickets', checkPermission('SUPPORT_READ'), getTickets);
router.post('/tickets', checkPermission('SUPPORT_WRITE'), createTicket);
router.put('/tickets/:id', checkPermission('SUPPORT_WRITE'), updateTicket);

// LMS / Training
router.use('/lms', requireFeature('LMS'));
router.get('/lms/courses', checkPermission('SUPPORT_READ'), getCourses);
router.post('/lms/courses', checkPermission('SUPPORT_WRITE'), createCourse);
router.get('/lms/trainings', checkPermission('SUPPORT_READ'), getMyTrainings);
router.post('/lms/trainings/enroll', checkPermission('SUPPORT_WRITE'), enrollTraining);
router.put('/lms/trainings/:id', checkPermission('SUPPORT_WRITE'), updateTrainingProgress);

export default router;
