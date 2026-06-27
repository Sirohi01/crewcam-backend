/** True when an AI provider error is a rate-limit/quota exhaustion, not a content or auth problem. */
export const isQuotaError = (message: string): boolean =>
  /429|quota|rate limit|too many requests/i.test(message);

/** "PerDay" appears in Gemini's free-tier quota id; other providers' 429s don't specify a window. */
export const describeQuotaError = (message: string): string =>
  /perday/i.test(message)
    ? 'Daily AI request limit for this provider has been reached — it will reset tomorrow.'
    : 'AI request limit for this provider has been reached for now — please try again shortly.';
