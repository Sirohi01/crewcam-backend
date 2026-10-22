import express from 'express';
import { getAuditLogs, createAuditLog } from '../controllers/auditLogController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.use(authenticate);

// Add RBAC check here if needed (e.g. require 'view_audit_logs' permission)
router.get('/', getAuditLogs);
router.post('/', createAuditLog);

export default router;
