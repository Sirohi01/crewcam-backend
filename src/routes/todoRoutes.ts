import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { createTodo, assignTodo, getMyTodos, updateTodo, deleteTodo } from '../controllers/todoController';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);

router.post('/', createTodo);
router.post('/assign', assignTodo);
router.get('/', getMyTodos);
router.put('/:id', updateTodo);
router.delete('/:id', deleteTodo);

export default router;
