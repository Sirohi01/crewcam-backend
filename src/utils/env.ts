// Fail-safe (allowlist) environment checks: anything that exposes secrets, stack
// traces, or other debug-only data must gate on `isDevEnvironment()`, not on a
// `NODE_ENV !== 'production'` blocklist check. An unset or misspelled NODE_ENV
// (e.g. a misconfigured staging box) must default to the SAFE behavior.
export const isDevEnvironment = (): boolean => {
  return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
};
