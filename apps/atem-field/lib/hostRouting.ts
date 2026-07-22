export function normalizeHostHeader(value: string | null | undefined): string {
  const raw = value?.trim() ?? '';
  if (!raw) return '';
  const bracketed = raw.match(/^\[([^\]]+)\]/);
  if (bracketed) return bracketed[1].toLowerCase();
  return raw.split(':')[0]?.toLowerCase() ?? '';
}

export function isPrivateLanHost(hostHeader: string | null | undefined): boolean {
  const host = normalizeHostHeader(hostHeader);
  if (!host) return true;
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
  if (host.endsWith('.local')) return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;

  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}
