export const RESERVED_SUBDOMAINS = ['www', 'app', 'api', 'localhost'];

const SUBDOMAIN_FORMAT = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Normalizes a raw subdomain/host label and rejects reserved words, IP-address labels,
 * and anything that isn't a valid DNS label. Shared by tenantResolver and the public
 * whitelabel/login endpoints so subdomain validation doesn't diverge between call sites.
 */
export function normalizeSubdomain(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (RESERVED_SUBDOMAINS.includes(value)) return null;
  if (!SUBDOMAIN_FORMAT.test(value)) return null;
  if (/^\d+$/.test(value)) return null; // first label of an IPv4 host, e.g. "127" from "127.0.0.1"
  return value;
}

/** Extracts and normalizes the subdomain label from a Host header value (may include a port). */
export function subdomainFromHost(host: string | undefined | null): string | null {
  if (!host) return null;
  const hostname = host.split(':')[0] || '';
  const firstLabel = hostname.split('.')[0] || '';
  return normalizeSubdomain(firstLabel);
}
