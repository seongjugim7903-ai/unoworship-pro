/**
 * app/api/atem/route.ts
 * ATEM 스위처 제어 API (Next.js App Router)
 *
 * 엔드포인트:
 *   GET  /api/atem          → 연결 상태 조회
 *   POST /api/atem/connect  → ATEM 연결
 *   POST /api/atem/subtitle → 자막 전송 (PNG base64 + 텍스트)
 *   POST /api/atem/clear    → 자막 해제 (DSK off)
 *   POST /api/atem/dsk      → DSK on/off 즉시 전환
 *   POST /api/atem/config   → 설정 변경
 *
 * 주의: atem-connection은 Node.js 전용이므로 반드시 서버 라우트에서 실행
 */

import { NextRequest, NextResponse } from 'next/server';
import { AtemBridge, AtemBridgeConfig } from '@/lib/atemBridge';
import { rejectLargeRequest, requireRequestRole, requireTrustedWriteRequest } from '@/lib/auth/serverAuth';

const MAX_SUBTITLE_PNG_BASE64_LENGTH = 12 * 1024 * 1024;
const MAX_ATEM_REQUEST_BYTES = 14 * 1024 * 1024;

function isPrivateIp(ip: string): boolean {
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;
  if (/^(127\.0\.0\.1|localhost)$/.test(ip)) return true;
  return false;
}

// ─── GET /api/atem ──────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const gate = await requireRequestRole(req, 'member');
  if ('response' in gate) return gate.response;

  return NextResponse.json({
    status: AtemBridge.status,
    config: AtemBridge.getConfig(),
  });
}

// ─── POST /api/atem ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const requiredRole = action === 'subtitle' || action === 'clear' || action === 'program'
    ? 'crew'
    : 'admin';

  const gate = await requireRequestRole(req, requiredRole);
  if ('response' in gate) return gate.response;
  const trustedWriteResponse = requireTrustedWriteRequest(req, gate.auth);
  if (trustedWriteResponse) return trustedWriteResponse;
  const tooLargeResponse = rejectLargeRequest(req, MAX_ATEM_REQUEST_BYTES);
  if (tooLargeResponse) return tooLargeResponse;

  try {
    switch (action) {
      // ── 연결 ──────────────────────────────────────────────────────────────
      case 'connect': {
        const body = await req.json() as { ip: string; config?: Partial<AtemBridgeConfig> };
        if (!body.ip) {
          return NextResponse.json({ error: 'ip 주소가 필요합니다.' }, { status: 400 });
        }
        if (!isPrivateIp(body.ip)) {
          return NextResponse.json({ error: '사설망 IP만 연결할 수 있습니다.' }, { status: 400 });
        }
        await AtemBridge.connect(body.ip, body.config);
        return NextResponse.json({ ok: true, status: AtemBridge.status });
      }

      // ── 연결 해제 ─────────────────────────────────────────────────────────
      case 'disconnect': {
        await AtemBridge.disconnect();
        return NextResponse.json({ ok: true });
      }

      // ── 자막 전송 ─────────────────────────────────────────────────────────
      // body: { png: string (base64), text: string }
      case 'subtitle': {
        const body = await req.json() as { png: string; text: string };
        if (!body.png) {
          return NextResponse.json({ error: 'PNG 데이터가 없습니다.' }, { status: 400 });
        }
        if (body.png.length > MAX_SUBTITLE_PNG_BASE64_LENGTH) {
          return NextResponse.json({ error: 'PNG 데이터가 너무 큽니다.' }, { status: 413 });
        }
        if (!AtemBridge.isConnected) {
          return NextResponse.json({ error: 'ATEM이 연결되어 있지 않습니다.' }, { status: 503 });
        }

        // base64 PNG → Buffer
        const base64Data = body.png.replace(/^data:image\/png;base64,/, '');
        const pngBuffer = Buffer.from(base64Data, 'base64');

        await AtemBridge.sendSubtitle(pngBuffer, body.text ?? '');
        return NextResponse.json({ ok: true, status: AtemBridge.status });
      }

      // ── 자막 해제 ─────────────────────────────────────────────────────────
      case 'clear': {
        await AtemBridge.clearSubtitle();
        return NextResponse.json({ ok: true, status: AtemBridge.status });
      }

      // ── DSK 즉시 on/off ───────────────────────────────────────────────────
      case 'dsk': {
        const body = await req.json() as { onAir: boolean };
        await AtemBridge.setDskOnAir(body.onAir);
        return NextResponse.json({ ok: true });
      }

      // ── 프로그램 입력 전환 (카메라 선택) ──────────────────────────────────
      // body: { input: number } — ME1 컷 전환
      case 'program': {
        const body = await req.json() as { input: number };
        if (!Number.isInteger(body.input) || body.input < 1 || body.input > 9999) {
          return NextResponse.json({ error: 'input은 1 이상의 입력 번호여야 합니다.' }, { status: 400 });
        }
        if (!AtemBridge.isConnected) {
          return NextResponse.json({ error: 'ATEM이 연결되어 있지 않습니다.' }, { status: 503 });
        }
        await AtemBridge.setProgramInput(body.input);
        return NextResponse.json({ ok: true, status: AtemBridge.status });
      }

      // ── 설정 변경 ─────────────────────────────────────────────────────────
      case 'config': {
        const body = await req.json() as Partial<AtemBridgeConfig>;
        AtemBridge.updateConfig(body);
        return NextResponse.json({ ok: true, config: AtemBridge.getConfig() });
      }

      default:
        return NextResponse.json({ error: '알 수 없는 action입니다.' }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
