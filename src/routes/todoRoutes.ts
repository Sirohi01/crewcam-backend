import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';
import { createTodo, getMyTodos, updateTodo, deleteTodo } from '../controllers/todoController';

const router = Router();
router.use(authenticate);
router.use(tenantResolver);

router.post('/', createTodo);
router.get('/', getMyTodos);
router.put('/:id', updateTodo);
router.delete('/:id', deleteTodo);

export default router;
