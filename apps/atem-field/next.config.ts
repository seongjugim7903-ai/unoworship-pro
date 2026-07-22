import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
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
