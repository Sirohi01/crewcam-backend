/** True when an AI provider error is a rate-limit/quota/credit exhaustion, not a content or syntax problem. */
export const isQuotaError = (message: string): boolean =>
  /429|402|quota|rate limit|too many requests|prepayment credits|credits are depleted|billing|insufficient_quota/i.test(message);

/** Explains quota/credit depletion clearly to the user. */
export const describeQuotaError = (message: string): string => {
  if (/402|prepayment credits|credits are depleted|billing|insufficient_quota/i.test(message)) {
    return 'AI provider credits are depleted or billing needs attention in your AI provider account.';
  }
  if (/perday/i.test(message)) {
    return 'Daily AI request limit for this provider has been reached — it will reset tomorrow.';
  }
  return 'AI request limit for this provider has been reached for now — please try again shortly.';
};
