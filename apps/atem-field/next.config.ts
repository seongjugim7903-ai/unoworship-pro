import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Electron 패키징: npm/tsx 없이 번들 서버로 직접 기동하기 위한 standalone 출력.
  // (docs/UNOWORSHIP_PRO_GITHUB_ELECTRON_RELEASE_RUNBOOK.md §8-1,2)
  output: 'standalone',
  experimental: {
    // [FIX: UPLOAD_TRUNCATION] 현장 운영판에서 찾은 수정. Next 16 의
    //   proxyClientMaxBodySize 기본값이 10MiB 라 그보다 큰 영상 업로드가
    //   **조용히 잘려서** 저장됐다(에러 없이 201 응답). 50MB 영상을 올리면
    //   앞 10MB 만 저장돼 송출 중 끊기거나 깨졌다.
    //   업로드 라우트의 자체 상한(1GB)과 클라이언트 권장 상한(300MB)이 따로
    //   있으므로 여기서는 넉넉히 열어두고 실제 제한은 그쪽에서 건다.
    proxyClientMaxBodySize: 1024 * 1024 * 1024,
  },
  // Keep Turbopack scoped to this app inside the parent Git repository.
  turbopack: {
    root: projectRoot,
  },
  // atem-connection은 Node.js 네이티브 UDP 모듈 사용 → 번들링 제외
  serverExternalPackages: ['atem-connection'],
  // LAN 내 다른 기기(윈도우 패널 PC 등)에서 접속 시 cross-origin 경고 제거
  allowedDevOrigins: [
    '192.168.0.*',
    '192.168.1.*',
    '10.0.0.*',
    '172.30.1.*',
    '172.28.113.*',
  ],
};

export default nextConfig;
