import { networkInterfaces } from 'node:os';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];

function splitEnvList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeHost(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`).hostname.toLowerCase();
  } catch {
    const bracketed = trimmed.match(/^\[([^\]]+)\]/);
    if (bracketed) return bracketed[1].toLowerCase();
    if (trimmed.includes(':') && !trimmed.includes('.')) return trimmed.toLowerCase();
    return trimmed.split(':')[0]?.toLowerCase() || null;
  }
}

function uniqueHosts(hosts: Array<string | null | undefined>): string[] {
  return [...new Set(hosts.map(normalizeHost).filter((host): host is string => !!host))];
}

export function getBindHost(): string {
  return process.env.UNOLIVE_BIND_HOST ?? process.env.HOST ?? '0.0.0.0';
}

export function getServerPort(): number {
  const parsed = Number(process.env.PORT ?? '3000');
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 3000;
}

function isPrivateLanHost(host: string): boolean {
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  const match = host.match(/^172\.(\d{1,2})\.\d{1,3}\.\d{1,3}$/);
  if (!match) return false;
  const second = Number(match[1]);
  return second >= 16 && second <= 31;
}

function shouldAutoAllowLocalLanHosts(): boolean {
  return process.env.UNOLIVE_AUTO_ALLOW_LOCAL_LAN !== '0';
}

function getDetectedLanHosts(): string[] {
  if (!shouldAutoAllowLocalLanHosts()) return [];

  const hosts: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (!isPrivateLanHost(entry.address)) continue;
      hosts.push(entry.address);
    }
  }
  return hosts;
}

export function getAllowedLanHosts(): string[] {
  const bindHost = getBindHost();
  return uniqueHosts([
    ...LOCAL_HOSTS,
    bindHost !== '0.0.0.0' && bindHost !== '::' ? bindHost : null,
    ...getDetectedLanHosts(),
    ...splitEnvList(process.env.UNOLIVE_SERVER_LAN_IP),
    ...splitEnvList(process.env.UNOLIVE_ALLOWED_LAN_HOSTS),
  ]);
}

export function getAllowedWriteHosts(): string[] {
  return uniqueHosts([
    ...getAllowedLanHosts(),
    ...splitEnvList(process.env.UNOLIVE_ALLOWED_WRITE_ORIGINS),
  ]);
}

function shouldUseDevLanFallback(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.UNOLIVE_STRICT_HOSTS !== '1';
}

export function isHostAllowed(hostHeader: string | null | undefined): boolean {
  const host = normalizeHost(hostHeader);
  if (!host) return false;
  if (shouldUseDevLanFallback() && isPrivateLanHost(host)) return true;
  return getAllowedLanHosts().includes(host);
}

export function isOriginAllowed(originHeader: string | null | undefined): boolean {
  if (!originHeader) return true;
  const originHost = normalizeHost(originHeader);
  if (!originHost) return false;
  if (shouldUseDevLanFallback() && isPrivateLanHost(originHost)) return true;
  return getAllowedLanHosts().includes(originHost);
}

export function describeDeploymentConfig(): string {
  return [
    `bind=${getBindHost()}`,
    `port=${getServerPort()}`,
    `strictHosts=${process.env.UNOLIVE_STRICT_HOSTS === '1' ? 'on' : 'off'}`,
    `autoAllowLocalLan=${shouldAutoAllowLocalLanHosts() ? 'on' : 'off'}`,
    `allowedLanHosts=${getAllowedLanHosts().join(',')}`,
    `allowedWriteHosts=${getAllowedWriteHosts().join(',')}`,
  ].join(' ');
}
