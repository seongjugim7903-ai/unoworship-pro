import { NextResponse } from 'next/server';
import { getServerLiveStatus } from '@/lib/broadcast/serverLiveBridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getServerLiveStatus(), {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
