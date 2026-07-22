import { NextRequest, NextResponse } from 'next/server';
import { requireRequestRole } from '@/lib/auth/serverAuth';
import { getSocketRuntimeMetrics } from '@/lib/server/socketServer';

export const runtime = 'nodejs';

const SERVER_STARTED_AT = Date.now();
const CPU_USAGE_STARTED_AT = process.cpuUsage();

function toMiB(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

function buildHealthPayload() {
  const memory = process.memoryUsage();
  const cpuUsage = process.cpuUsage(CPU_USAGE_STARTED_AT);

  return {
    ok: true,
    timestamp: new Date().toISOString(),
    server: {
      nodeEnv: process.env.NODE_ENV ?? 'development',
      pid: process.pid,
      startedAt: new Date(SERVER_STARTED_AT).toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rssMiB: toMiB(memory.rss),
        heapTotalMiB: toMiB(memory.heapTotal),
        heapUsedMiB: toMiB(memory.heapUsed),
        externalMiB: toMiB(memory.external),
        arrayBuffersMiB: toMiB(memory.arrayBuffers),
      },
      cpuUsageMicros: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
    },
    socket: getSocketRuntimeMetrics(),
  };
}

export async function GET(req: NextRequest) {
  if (process.env.UNOLIVE_HEALTH_PUBLIC !== '1') {
    const authResult = await requireRequestRole(req, 'crew');
    if ('response' in authResult) return authResult.response;
  }

  return NextResponse.json(buildHealthPayload(), {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
