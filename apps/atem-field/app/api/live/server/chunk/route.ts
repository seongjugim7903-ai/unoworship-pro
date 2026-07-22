import { NextRequest, NextResponse } from 'next/server';
import { pushServerLiveChunk } from '@/lib/broadcast/serverLiveBridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const chunk = Buffer.from(await req.arrayBuffer());
    const result = pushServerLiveChunk(chunk);
    return NextResponse.json(result, {
      status: result.ok ? 200 : 409,
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
