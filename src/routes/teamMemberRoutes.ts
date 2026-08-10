import { Router } from 'express';

import {
  getTeamMembers,
  getTeamMemberById,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
} from '../controllers/teamMemberController';

const router = Router();

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