import { NextResponse } from 'next/server';
import { stopServerLiveStream } from '@/lib/broadcast/serverLiveBridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(stopServerLiveStream(), {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
