import axios from 'axios';

export interface PublishPayload {
  jobTitle: string;
  jobDescription: string;
  applyUrl: string;
}

// Self-URL for the mock Naukri/LinkedIn endpoints (testPublishRoutes.ts) this process also
// serves, so test-mode publishing is a real HTTP round trip (sent, validated, stored,
// responded) instead of a console.log faking success with nothing behind it.
const TEST_PUBLISH_BASE_URL = process.env.TEST_PUBLISH_BASE_URL || `http://localhost:${process.env.PORT || 8000}`;

/**
 * Publishes a job to LinkedIn.
 */
export async function publishToLinkedIn(payload: PublishPayload, organizationUrn?: string): Promise<{ success: boolean; externalId?: string; error?: string }> {
  const isTestMode = process.env.TEST_PUBLISH_MODE === 'true';
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const urn = organizationUrn || process.env.LINKEDIN_ORGANIZATION_URN;

  // No real LinkedIn credentials configured — route the exact same request to this app's
  // own mock LinkedIn endpoint instead of the real API.
  const useTestEndpoint = isTestMode || !accessToken || !urn;
  const url = useTestEndpoint ? `${TEST_PUBLISH_BASE_URL}/api/v1/test-publish/linkedin/ugcPosts` : 'https://api.linkedin.com/v2/ugcPosts';

  try {
    const textContent = `We're hiring a ${payload.jobTitle}!\n\n${payload.jobDescription.substring(0, 500)}...\n\nApply here: ${payload.applyUrl}`;
    const requestBody = {
      author: `urn:li:organization:${urn || 'test-org'}`,
      lifecycleState: "PUBLISHED",
      specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: textContent }, shareMediaCategory: "NONE" } },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" }
    };
    const response = await axios.post(url, requestBody, {
      headers: { 'Authorization': `Bearer ${accessToken || 'test-token'}`, 'X-Restli-Protocol-Version': '2.0.0', 'Content-Type': 'application/json' }
    });
    return { success: true, externalId: response.data.id };
  } catch (error: any) {
    console.error('[publishService] LinkedIn publish failed:', error?.response?.data || error?.message);
    return { success: false, error: error?.response?.data?.message || error?.message || 'LinkedIn publish failed' };
  }
}

/**
 * Publishes a job to Naukri.com
 * Note: Naukri uses a proprietary XML/JSON API for enterprise clients.
 */
export async function publishToNaukri(payload: PublishPayload): Promise<{ success: boolean; externalId?: string; error?: string }> {
  const isTestMode = process.env.TEST_PUBLISH_MODE === 'true';
  const apiKey = process.env.NAUKRI_API_KEY;

  // No real Naukri API key configured — route to this app's own mock Naukri endpoint
  // instead of the real API.
  const useTestEndpoint = isTestMode || !apiKey;
  const url = useTestEndpoint ? `${TEST_PUBLISH_BASE_URL}/api/v1/test-publish/naukri/jobs` : 'https://api.naukri.com/v2/jobs';

  try {
    const response = await axios.post(url, {
      title: payload.jobTitle,
      description: payload.jobDescription,
      applyUrl: payload.applyUrl
    }, {
      headers: { 'Authorization': `Bearer ${apiKey || 'test-key'}` }
    });
    return { success: true, externalId: response.data.jobId };
  } catch (error: any) {
    console.error('[publishService] Naukri publish failed:', error?.response?.data || error?.message);
    return { success: false, error: error?.response?.data?.message || error?.message || 'Naukri publish failed' };
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
