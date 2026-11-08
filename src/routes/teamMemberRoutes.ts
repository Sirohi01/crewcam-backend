import { Router } from 'express';

import {
  getTeamMembers,
  getTeamMemberById,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
} from '../controllers/teamMemberController';
import { authenticate } from '../middleware/auth';
import { tenantResolver } from '../middleware/tenantResolver';

const router = Router();

// Declared explicitly rather than relying on the bare '/api/v1' router mounted before
// this one in app.ts — reordering app.ts must never make these routes public.
router.use(authenticate);
router.use(tenantResolver);

/*** GET * /sub-departments/:subDepartment/team-members */
router.get(
  '/:subDepartment/team-members',
  getTeamMembers
);

/** GET ONE */
router.get(
  '/:subDepartment/team-members/:id',
  getTeamMemberById
);

/**
 * CREATE
 */
router.post(
  '/:subDepartment/team-members',
  createTeamMember
);

/**
 * UPDATE
 */
router.put(
  '/:subDepartment/team-members/:id',
  updateTeamMember
);

/**
 * DELETE
 */
router.delete(
  '/:subDepartment/team-members/:id',
  deleteTeamMember
);

export default router;