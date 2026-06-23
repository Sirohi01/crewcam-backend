import express from 'express';
import { getAuditLogs } from '../controllers/auditLogController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.use(authenticate);

// Add RBAC check here if needed (e.g. require 'view_audit_logs' permission)
router.get('/', getAuditLogs);

export default router;
