import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { createMeeting, getMeetings, getMeetingById, cancelMeeting, updateMeetingStatus, upsertMoM, getMoM, updateMeeting } from '../controllers/meetingController';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);

router.post('/', createMeeting);
router.get('/', getMeetings);
router.get('/:id', getMeetingById);
router.put('/:id', updateMeeting);
router.put('/:id/cancel', cancelMeeting);
router.put('/:id/status', updateMeetingStatus);
router.put('/:id/mom', upsertMoM);
router.get('/:id/mom', getMoM);

export default router;
