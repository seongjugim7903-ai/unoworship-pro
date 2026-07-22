import { NextResponse } from 'next/server';
import { checkServerLiveFfmpeg } from '@/lib/broadcast/serverLiveBridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const status = await checkServerLiveFfmpeg();
  return NextResponse.json(status, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
