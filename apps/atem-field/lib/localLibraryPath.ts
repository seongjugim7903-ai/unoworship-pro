/**
 * lib/localLibraryPath.ts
 * 로컬 라이브러리 공통 경로 모듈 (서버 전용)
 *
 * 원칙 (docs/UNOWORSHIP_SAAS_ELECTRON_DATA_ARCHITECTURE_PLAN.md):
 *   - 설치된 Electron 앱은 asar/앱 번들 내부에 쓰지 않는다.
 *   - 교회 데이터는 외부 로컬 라이브러리(~/Documents/UnoWorship Library)에 둔다.
 *
 * 동작:
 *   - UNOLIVE_LIBRARY_DIR 이 설정되면(패키지 앱에서 Electron main 이 주입)
 *     모든 데이터/생성물 경로가 그 폴더 아래로 간다.
 *   - 미설정(개발 모드)이면 기존 프로젝트 경로(./data, ./public/generated)를
 *     그대로 사용해 현행 개발 흐름을 바꾸지 않는다.
 */

import path from 'node:path';
import os from 'node:os';

export function libraryRoot(): string | null {
  const fromEnv = process.env.UNOLIVE_LIBRARY_DIR?.trim();
  return fromEnv ? fromEnv : null;
}

/** 패키지 앱 기본 라이브러리 위치 (Electron main 이 첫 실행 시 생성) */
export function defaultLibraryDir(): string {
  return path.join(os.homedir(), 'Documents', 'UnoWorship Library');
}

/** data/* 계열 (programs, templates, designs, bibles, hymns, fixed-programs, media ...) */
export function dataPath(...segments: string[]): string {
  const root = libraryRoot();
  if (root) return path.join(root, 'data', ...segments);
  return path.join(process.cwd(), 'data', ...segments);
}

/** 생성 에셋 (기존 public/generated/*) — 패키지 앱에서는 라이브러리로 이동 */
export function generatedPath(...segments: string[]): string {
  const root = libraryRoot();
  if (root) return path.join(root, 'generated', ...segments);
  return path.join(process.cwd(), 'public', 'generated', ...segments);
}

/**
 * 생성 에셋을 참조하는 URL prefix.
 * dev: Next 정적 서빙(/generated/...) 그대로.
 * 패키지 앱: 라이브러리 폴더를 /api/library-assets/... 라우트로 서빙.
 */
export function generatedUrlBase(): string {
  return libraryRoot() ? '/api/library-assets' : '/generated';
}

/** 가져오기 원본 보관(archive) 경로 — 패키지 앱에서는 라이브러리로 이동 */
export function archivePath(...segments: string[]): string {
  const root = libraryRoot();
  if (root) return path.join(root, 'archive', ...segments);
  return path.join(process.cwd(), 'generator', 'ppt-slides', 'inbox', 'archive', ...segments);
}

/** PPT/찬양 원본 보관 라이브러리 (기존 FILES/01_HYMNS, FILES/02_PRAISE) */
export function filesPath(...segments: string[]): string {
  const root = libraryRoot();
  if (root) return path.join(root, 'files', ...segments);
  return path.join(process.cwd(), 'FILES', ...segments);
}

/** 생성 manifest 백업 (기존 generator/ppt-slides/generated) */
export function manifestsPath(...segments: string[]): string {
  const root = libraryRoot();
  if (root) return path.join(root, 'manifests', ...segments);
  return path.join(process.cwd(), 'generator', 'ppt-slides', 'generated', ...segments);
}
