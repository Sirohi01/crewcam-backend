import express from 'express';
import { getSessions, revokeSession, revokeAllOtherSessions } from '../controllers/sessionController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.use(authenticate);

router.get('/', getSessions);
router.delete('/all', revokeAllOtherSessions);
router.delete('/:id', revokeSession);

export default router;
