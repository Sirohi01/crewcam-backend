import express from 'express';
import { 
  createCustomField, 
  getCustomFieldsByDepartment, 
  deleteCustomField,
  getCustomFieldById,
  updateCustomField
} from '../controllers/customFieldController';
import { authenticate } from '../middleware/auth';
import { checkPermission } from '../middleware/rbac';


const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Create a custom field
router.post('/', checkPermission('ORG_WRITE'), createCustomField);

// Get all custom fields for a specific department
router.get('/department/:departmentId', getCustomFieldsByDepartment);

// Get a single custom field by ID
router.get('/field/:id', getCustomFieldById);

// Update a custom field
router.put('/:id', checkPermission('ORG_WRITE'), updateCustomField);

// Delete a custom field
router.delete('/:id', checkPermission('ORG_WRITE'), deleteCustomField);

export default router;
