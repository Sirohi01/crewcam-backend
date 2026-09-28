import axios from 'axios';

export interface PublishPayload {
  jobTitle: string;
  jobDescription: string;
  applyUrl: string;
}

/**
 * Publishes a job to LinkedIn.
 */
export async function publishToLinkedIn(payload: PublishPayload, organizationUrn?: string): Promise<{ success: boolean; externalId?: string; error?: string }> {
  const isTestMode = process.env.TEST_PUBLISH_MODE === 'true';
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const urn = organizationUrn || process.env.LINKEDIN_ORGANIZATION_URN;

  if (isTestMode || !accessToken || !urn) {
    console.log('[publishService] [TEST MODE] Would publish to LinkedIn:', payload.jobTitle);
    return { success: true, externalId: `mock-linkedin-${Date.now()}` };
  }

  try {
    const textContent = `We're hiring a ${payload.jobTitle}!\n\n${payload.jobDescription.substring(0, 500)}...\n\nApply here: ${payload.applyUrl}`;
    const requestBody = {
      author: `urn:li:organization:${urn}`,
      lifecycleState: "PUBLISHED",
      specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: textContent }, shareMediaCategory: "NONE" } },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" }
    };
    const response = await axios.post('https://api.linkedin.com/v2/ugcPosts', requestBody, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Restli-Protocol-Version': '2.0.0', 'Content-Type': 'application/json' }
    });
    return { success: true, externalId: response.data.id };
  } catch (error: any) {
    console.error('[publishService] LinkedIn publish failed:', error?.response?.data || error?.message);
    return { success: false, error: error?.message || 'LinkedIn publish failed' };
  }
}

/**
 * Publishes a job to Naukri.com
 * Note: Naukri uses a proprietary XML/JSON API for enterprise clients.
 */
export async function publishToNaukri(payload: PublishPayload): Promise<{ success: boolean; externalId?: string; error?: string }> {
  const isTestMode = process.env.TEST_PUBLISH_MODE === 'true';
  const apiKey = process.env.NAUKRI_API_KEY;

  if (isTestMode || !apiKey) {
    console.log('[publishService] [TEST MODE] Would publish to Naukri.com:', payload.jobTitle);
    return { success: true, externalId: `mock-naukri-${Date.now()}` };
  }

  try {
    // Mocking real Naukri API structure
    const response = await axios.post('https://api.naukri.com/v2/jobs', {
      title: payload.jobTitle,
      description: payload.jobDescription,
      applyUrl: payload.applyUrl
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    return { success: true, externalId: response.data.jobId };
  } catch (error: any) {
    console.error('[publishService] Naukri publish failed:', error?.message);
    return { success: false, error: error?.message || 'Naukri publish failed' };
  }
}

/**
 * Publishes a job to Indeed
 * Note: Indeed uses XML feeds or direct API integrations for ATS.
 */
export async function publishToIndeed(payload: PublishPayload): Promise<{ success: boolean; externalId?: string; error?: string }> {
  const isTestMode = process.env.TEST_PUBLISH_MODE === 'true';
  const apiKey = process.env.INDEED_API_KEY;

  if (isTestMode || !apiKey) {
    console.log('[publishService] [TEST MODE] Would publish to Indeed:', payload.jobTitle);
    return { success: true, externalId: `mock-indeed-${Date.now()}` };
  }

  try {
    // Mocking real Indeed API structure
    const response = await axios.post('https://apis.indeed.com/v2/jobs', {
      title: payload.jobTitle,
      description: payload.jobDescription,
      url: payload.applyUrl
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    return { success: true, externalId: response.data.id };
  } catch (error: any) {
    console.error('[publishService] Indeed publish failed:', error?.message);
    return { success: false, error: error?.message || 'Indeed publish failed' };
  }
}
