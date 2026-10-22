import { Router, Request, Response } from 'express';
import { ManpowerRequest } from '../models/ManpowerRequest';

const router = Router();

/**
 * GET /api/careers/jobs
 * Public API to fetch published jobs for the Career Portal.
 */
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const { search, location } = req.query;

    const filter: any = {
      publishChannels: 'Career Portal', // Must have 'Career Portal' selected
      status: 'Approved' // Only show approved jobs
    };

    if (search && String(search).trim()) {
      filter.jobTitle = { $regex: String(search).trim(), $options: 'i' };
    }

    const query = ManpowerRequest.find(filter)
      .populate('departmentId', 'name')
      .populate('locationBranchId', 'name city state')
      .sort({ createdAt: -1 });

    const jobs = await query;

    // Filter location in-memory if needed, or expand filter to location branch
    let results = jobs;
    if (location && String(location).trim()) {
      const locTerm = String(location).trim().toLowerCase();
      results = results.filter((job: any) => 
        job.workLocation?.toLowerCase().includes(locTerm) ||
        job.locationBranchId?.name?.toLowerCase().includes(locTerm) ||
        job.locationBranchId?.city?.toLowerCase().includes(locTerm)
      );
    }

    res.status(200).json({ data: results });
  } catch (error: any) {
    console.error('Error fetching career portal jobs:', error);
    res.status(500).json({ message: 'Error fetching jobs' });
  }
});

export default router;
