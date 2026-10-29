import { Router } from 'express';
import { createNaukriTestJob, createLinkedInTestPost, listTestPostings } from '../controllers/testPublishController';

const router = Router();

// Mock endpoints standing in for Naukri's and LinkedIn's real job-posting APIs — same
// request/response shape publishService.ts already builds for the real ones — so posting
// to these channels can be exercised end-to-end (a real HTTP call, really stored, really
// returned) without needing real Naukri/LinkedIn API access. No auth: this never handles
// anything beyond a job title/description, same trust level as the public careers routes.
router.post('/naukri/jobs', createNaukriTestJob);
router.post('/linkedin/ugcPosts', createLinkedInTestPost);
router.get('/postings', listTestPostings);

export default router;
