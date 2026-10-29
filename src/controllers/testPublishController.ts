import { Request, Response } from 'express';
import { TestJobPosting } from '../models/TestJobPosting';

/** Stand-in for Naukri's job-create API. publishService.ts posts the same body it would
 * send to the real https://api.naukri.com/v2/jobs, and expects the same `{ jobId }` shape back. */
export const createNaukriTestJob = async (req: Request, res: Response) => {
  try {
    const { title, description, applyUrl } = req.body;
    if (!title) return res.status(400).json({ message: 'title is required' });

    const posting = await TestJobPosting.create({
      provider: 'naukri',
      jobTitle: title,
      jobDescription: description,
      applyUrl,
    });
    res.status(201).json({ jobId: String(posting._id) });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to create test Naukri posting' });
  }
};

/** Stand-in for LinkedIn's UGC posts API. publishService.ts posts the same body it would
 * send to the real https://api.linkedin.com/v2/ugcPosts, and expects the same `{ id }` shape back. */
export const createLinkedInTestPost = async (req: Request, res: Response) => {
  try {
    const shareContent = req.body?.specificContent?.['com.linkedin.ugc.ShareContent'];
    const text = shareContent?.shareCommentary?.text;
    if (!text) return res.status(400).json({ message: 'specificContent.com.linkedin.ugc.ShareContent.shareCommentary.text is required' });

    const posting = await TestJobPosting.create({
      provider: 'linkedin',
      jobTitle: text.split('\n')[0] || 'Untitled',
      jobDescription: text,
    });
    res.status(201).json({ id: `urn:li:ugcPost:${posting._id}` });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to create test LinkedIn post' });
  }
};

/** Lets you verify what actually came through, instead of trusting a console.log —
 * GET /api/v1/test-publish/postings?provider=naukri|linkedin */
export const listTestPostings = async (req: Request, res: Response) => {
  const { provider } = req.query;
  const filter: any = {};
  if (provider === 'naukri' || provider === 'linkedin') filter.provider = provider;

  const postings = await TestJobPosting.find(filter).sort({ createdAt: -1 }).limit(100);
  res.json({ data: postings });
};
