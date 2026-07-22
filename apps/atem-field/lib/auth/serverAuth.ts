import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '../supabase/server';
import type { Database } from '../../types/database.types';
import { hashDeviceToken } from './deviceToken';
import { ROLE_LEVEL, UserRole } from './types';
import { getAllowedWriteHosts } from '../server/deploymentConfig';

export type DeviceType = 'server' | 'composer';

export interface ServerAuthContext {
  kind: 'session' | 'device' | 'dev';
  userId: string;
  churchId: string | null;
  role: UserRole;
  deviceType?: DeviceType;
  deviceTokenId?: string;
}

const VALID_ROLES: UserRole[] = ['member', 'crew', 'admin', 'superadmin'];

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && VALID_ROLES.includes(value as UserRole);
}

function getAdminClient() {
  return createSupabaseAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

function parseCookieHeader(cookieHeader: string | null | undefined): Array<{ name: string; value: string }> {
  if (!cookieHeader) return [];

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [rawName, ...rawValueParts] = part.split('=');
      const name = rawName.trim();
      const rawValue = rawValueParts.join('=');
      let value = rawValue;
      try {
        value = decodeURIComponent(rawValue);
      } catch {
        value = rawValue;
      }
      return { name, value };
    })
    .filter((cookie) => cookie.name);
}

function getHeaderHost(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function getRequestHost(req: NextRequest): string | null {
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || req.headers.get('host') || req.nextUrl.host;
  return host.split(':')[0]?.toLowerCase() || null;
}

function isTrustedWriteOrigin(req: NextRequest): boolean {
  const requestHost = getRequestHost(req);
  const originHost = getHeaderHost(req.headers.get('origin'));
  const refererHost = getHeaderHost(req.headers.get('referer'));
  const allowedHosts = new Set([
    requestHost,
    ...getAllowedWriteHosts(),
  ].filter((host): host is string => !!host).map((host) => host.toLowerCase()));

  if (originHost && allowedHosts.has(originHost.toLowerCase())) return true;
  if (refererHost && allowedHosts.has(refererHost.toLowerCase())) return true;
  return false;
}

async function getCanonicalProfile(userId: string): Promise<{ role: UserRole; churchId: string | null }> {
  const admin = getAdminClient();
  const [{ data }, { data: userData }] = await Promise.all([
    admin
      .from('profiles')
      .select('role, church_id')
      .eq('id', userId)
      .maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);

  const profileRole = isUserRole(data?.role) ? data.role : 'member';
  const metadataRole = isUserRole(userData?.user?.user_metadata?.role)
    ? userData.user.user_metadata.role
    : 'member';
  const role = ROLE_LEVEL[metadataRole] > ROLE_LEVEL[profileRole]
    ? metadataRole
    : profileRole;

  return {
    role,
    churchId: data?.church_id ?? null,
  };
}

export async function getAuthFromCookieHeader(cookieHeader: string | null | undefined): Promise<ServerAuthContext | null> {
  const parsedCookies = parseCookieHeader(cookieHeader);
  if (!parsedCookies.length) return null;

  try {
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return parsedCookies;
          },
          setAll() {
            // Socket.io handshake 에서는 응답 쿠키 갱신을 하지 않는다.
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const profile = await getCanonicalProfile(user.id);
    return {
      kind: 'session',
      userId: user.id,
      churchId: profile.churchId,
      role: profile.role,
    };
  } catch {
    return null;
  }
}

export function hasMinRole(auth: ServerAuthContext, required: UserRole): boolean {
  return ROLE_LEVEL[auth.role] >= ROLE_LEVEL[required];
}

export async function verifyDeviceToken(token: string): Promise<ServerAuthContext | null> {
  if (!token) return null;

  const admin = getAdminClient();
  const tokenHash = hashDeviceToken(token);

  const { data: row, error } = await admin
    .from('device_tokens')
    .select('id, user_id, church_id, device_type, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error || !row || row.revoked_at) return null;

  const profile = await getCanonicalProfile(row.user_id);
  const deviceType = row.device_type === 'server' || row.device_type === 'composer'
    ? row.device_type
    : undefined;

  return {
    kind: 'device',
    userId: row.user_id,
    churchId: row.church_id ?? profile.churchId,
    role: profile.role,
    deviceType,
    deviceTokenId: row.id,
  };
}

export async function getRequestAuth(req: NextRequest): Promise<ServerAuthContext | null> {
  const deviceToken = req.headers.get('x-device-token');
  if (deviceToken) {
    const deviceAuth = await verifyDeviceToken(deviceToken);
    if (deviceAuth) return deviceAuth;
  }

  const devAuth = getSocketDevAuth();
  if (devAuth) return devAuth;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await getCanonicalProfile(user.id);
  return {
    kind: 'session',
    userId: user.id,
    churchId: profile.churchId,
    role: profile.role,
  };
}

export async function requireRequestRole(
  req: NextRequest,
  required: UserRole
): Promise<{ auth: ServerAuthContext } | { response: NextResponse }> {
  const auth = await getRequestAuth(req);
  if (!auth) {
    return {
      response: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }),
    };
  }

  if (!hasMinRole(auth, required)) {
    return {
      response: NextResponse.json({ error: `Forbidden: ${required} role required` }, { status: 403 }),
    };
  }

  return { auth };
}

export function requireTrustedWriteRequest(
  req: NextRequest,
  auth: ServerAuthContext
): NextResponse | null {
  if (auth.kind === 'device' || auth.kind === 'dev') return null;
  if (isTrustedWriteOrigin(req)) return null;

  return NextResponse.json(
    { error: 'Forbidden: trusted write origin required' },
    { status: 403 }
  );
}

export function rejectLargeRequest(req: NextRequest, maxBytes: number): NextResponse | null {
  const contentLength = req.headers.get('content-length');
  if (!contentLength) return null;

  const parsed = Number(contentLength);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return NextResponse.json({ error: 'Invalid content-length' }, { status: 400 });
  }

  if (parsed > maxBytes) {
    return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
  }

  return null;
}

export function getSocketDevAuth(): ServerAuthContext | null {
  if (process.env.NODE_ENV === 'production') return null;
  if (process.env.UNOLIVE_SOCKET_DEV_BYPASS !== '1') return null;

  return {
    kind: 'dev',
    userId: 'dev-socket',
    churchId: null,
    role: 'superadmin',
    deviceType: 'server',
  };
}
