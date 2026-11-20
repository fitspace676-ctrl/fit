import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class ZkbioUrlError extends Error {
  constructor() {
    super('ZKBio requires a public HTTP(S) server URL');
    this.name = 'ZkbioUrlError';
  }
}
export function normalizeBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      value.includes('?') ||
      value.includes('#')
    )
      throw new ZkbioUrlError();
    url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/api$/, '');
    // The vendor base is an origin, not an arbitrary proxy path.
    if (url.pathname && url.pathname !== '/') throw new ZkbioUrlError();
    return url.origin;
  } catch {
    throw new ZkbioUrlError();
  }
}
export interface VettedAddress {
  address: string;
  family: number;
}
export type HostLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<VettedAddress[]>;

function publicV4(address: string): boolean {
  const [a = 0, b = 0] = address.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
function publicAddress(address: string): boolean {
  if (isIP(address) === 4) return publicV4(address);
  if (isIP(address) !== 6 || address.includes('%')) return false;
  // WHATWG URL canonicalizes IPv4-mapped dotted notation to hex.
  const canonical = new URL(`http://[${address}]`).hostname.slice(1, -1);
  const parts = canonical.split('::');
  const left = parts[0] ? parts[0].split(':') : [];
  const right = parts[1] ? parts[1].split(':') : [];
  const words = (
    parts.length === 2
      ? [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right]
      : left
  ).map((x) => parseInt(x, 16));
  if (words.slice(0, 5).every((x) => x === 0) && words[5] === 0xffff) {
    const high = words[6]!;
    const low = words[7]!;
    return publicV4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  // Only global unicast 2000::/3; reject ULA, local, multicast, unspecified,
  // IPv4-compatible and translation ranges as well as IPv6 transition tunnels.
  return (
    (words[0]! & 0xe000) === 0x2000 &&
    words[0] !== 0x2002 &&
    !(words[0] === 0x2001 && (words[1] === 0 || words[1] === 0xdb8))
  );
}
/** Validate EVERY answer, returning addresses for transport-level DNS pinning. */
export async function assertPublicHost(
  value: string | URL,
  { lookup = dnsLookup }: { lookup?: HostLookup } = {},
): Promise<VettedAddress[]> {
  const url = new URL(normalizeBaseUrl(String(value)));
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  try {
    const family = isIP(hostname);
    const addresses = family
      ? [{ address: hostname, family }]
      : await lookup(hostname, { all: true, verbatim: true });
    if (
      !addresses.length ||
      addresses.some((x) => !publicAddress(x.address) || isIP(x.address) !== x.family)
    )
      throw new ZkbioUrlError();
    return addresses;
  } catch {
    throw new ZkbioUrlError();
  }
}
