import express from 'express';
import { 
  createCustomField, 
  getCustomFieldsByDepartment, 
  deleteCustomField,
  getCustomFieldById,
  updateCustomField
} from '../controllers/customFieldController';
import { authenticate } from '../middleware/auth';


const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Create a custom field
router.post('/', createCustomField);

// Get all custom fields for a specific department
router.get('/department/:departmentId', getCustomFieldsByDepartment);

// Get a single custom field by ID
router.get('/field/:id', getCustomFieldById);

// Update a custom field
router.put('/:id', updateCustomField);

// Delete a custom field
router.delete('/:id', deleteCustomField);

export default router;
