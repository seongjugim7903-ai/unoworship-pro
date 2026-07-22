import { NextRequest, NextResponse } from 'next/server';
import { requireRequestRole } from '@/lib/auth/serverAuth';
import { getLatencyDiagnostics } from '@/lib/server/socketServer';

export const runtime = 'nodejs';

function isLocalhostRequest(req: NextRequest): boolean {
  const host = req.headers.get('host')?.split(':')[0]?.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

export async function GET(req: NextRequest) {
  const publicDiagnostics =
    process.env.UNOLIVE_LATENCY_PUBLIC === '1' ||
    process.env.UNOLIVE_HEALTH_PUBLIC === '1' ||
    process.env.UNOLIVE_SOCKET_DEV_BYPASS === '1' ||
    isLocalhostRequest(req);

  if (!publicDiagnostics) {
    const authResult = await requireRequestRole(req, 'crew');
    if ('response' in authResult) return authResult.response;
  }

  const limitParam = req.nextUrl.searchParams.get('limit');
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 80;

  return NextResponse.json(getLatencyDiagnostics(Number.isFinite(limit) ? limit : 80), {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
