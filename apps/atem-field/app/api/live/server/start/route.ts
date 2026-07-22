import { NextRequest, NextResponse } from 'next/server';
import { startServerLiveStream } from '@/lib/broadcast/serverLiveBridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const bitrate = Number(body.bitrate);
    const result = startServerLiveStream({
      streamUrl: String(body.streamUrl ?? ''),
      streamKey: String(body.streamKey ?? ''),
      bitrate: Number.isFinite(bitrate) && bitrate > 0 ? bitrate : undefined,
    });

    return NextResponse.json(result, {
      status: result.ok ? 200 : 400,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
