import express from 'express';

import {
  getHistory,
  createHistory,
  getActivitySummary,
  getActivityGroups,
} from '../controllers/historyController';

const router = express.Router();


// ======================================================
// GET HISTORY
// ======================================================

router.get(
  '/:code/history',
  getHistory
);


// ======================================================
// CREATE HISTORY
// ======================================================

router.post(
  '/:code/history',
  createHistory
);


// ======================================================
// ACTIVITY SUMMARY
// ======================================================

router.get(
  '/:code/history/summary',
  getActivitySummary
);


// ======================================================
// ACTIVITY GROUPS
// ======================================================

router.get(
  '/:code/history/activity-groups',
  getActivityGroups
);


export default router;