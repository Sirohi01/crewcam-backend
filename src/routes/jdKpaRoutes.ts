import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { checkPermission } from '../middleware/rbac';
import {
  listJdLibrary, createJdLibraryEntry, updateJdLibraryEntry, deleteJdLibraryEntry,
  listKpaLibrary, createKpaLibraryEntry, updateKpaLibraryEntry, deleteKpaLibraryEntry,
} from '../controllers/jdKpaLibraryController';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);
router.get('/jd-library', checkPermission('MASTER_READ'), listJdLibrary);
router.post('/jd-library', checkPermission('MASTER_WRITE'), createJdLibraryEntry);
router.put('/jd-library/:id', checkPermission('MASTER_WRITE'), updateJdLibraryEntry);
router.delete('/jd-library/:id', checkPermission('MASTER_WRITE'), deleteJdLibraryEntry);
router.get('/kpa-library', checkPermission('MASTER_READ'), listKpaLibrary);
router.post('/kpa-library', checkPermission('MASTER_WRITE'), createKpaLibraryEntry);
router.put('/kpa-library/:id', checkPermission('MASTER_WRITE'), updateKpaLibraryEntry);
router.delete('/kpa-library/:id', checkPermission('MASTER_WRITE'), deleteKpaLibraryEntry);

export default router;
