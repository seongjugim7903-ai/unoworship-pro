'use client';

/**
 * AddSceneModal — Scene Rack 에 새 카드를 추가하는 2단계 모달
 *
 *  Step 1  소스 타입 픽커
 *          ┌─────────┬─────────┬─────────┐
 *          │ 🖼 이미지 │ 📺 브라우저│ 📖 캔버스│
 *          ├─────────┼─────────┼─────────┤
 *          │ 🎥 영상  │ ⏱ 카운트 │ ⚫ 검정  │
 *          └─────────┴─────────┴─────────┘
 *
 *  Step 2  타입별 설정 폼
 *          - image:    URL / 설명
 *          - browser:  URL
 *          - canvas:   저장된 캔버스 페이지 선택 (mock)
 *          - video:    URL
 *          - countdown:분/초
 *          - black:    라벨만
 *
 *          공통:
 *          - 라벨 (필수)
 *          - 메모 (선택)
 *          - 대표 색 (accent color chip)
 *
 *  Phase 2B.2: 이 모달은 UI 셸 + store 연동.
 *  실제 파일 업로드·캔버스 페이지 로드·디바이스 선택은 Phase 2C 에서 확장.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMediaStore, SCENE_KIND_LABEL, SCENE_KIND_ICON } from '@/lib/media/mediaStore';
import type { NewSceneInput, SceneKind } from '@/lib/media/mediaTypes';

// ─────────────────────────────────────────
// 모달에서 노출할 소스 카인드 (camera/window 는 Phase 2C+)
// ─────────────────────────────────────────
type PickableKind = Extract<
  SceneKind,
  'image' | 'browser-url' | 'canvas' | 'video' | 'countdown' | 'black' | 'audio-cover'
> extends never
  ? SceneKind
  : SceneKind;

const PICKABLE_KINDS: SceneKind[] = [
  'image',
  'window', // 브라우저/윈도우 캡처
  'canvas',
  'video',
  'countdown',
  'audio-cover',
  'black',
];

// SceneKind 중 UI 에서 "브라우저" 로 표기할 대상
const BROWSER_KIND: SceneKind = 'window';

// ─────────────────────────────────────────
// Mock 캔버스 페이지 리스트
// Phase 2C 에서는 실제 Canvas store 와 연결됩니다.
// ─────────────────────────────────────────
interface MockCanvasPage {
  id: string;
  name: string;
  thumbnail?: string;
  updatedAt: number;
}
const MOCK_CANVAS_PAGES: MockCanvasPage[] = [
  { id: 'canvas-sermon-title',   name: '설교 제목 카드',       updatedAt: Date.now() - 86400_000 },
  { id: 'canvas-scripture-card', name: '성경 구절 템플릿',     updatedAt: Date.now() - 172800_000 },
  { id: 'canvas-welcome-slide',  name: '환영 슬라이드',        updatedAt: Date.now() - 259200_000 },
  { id: 'canvas-announce',       name: '광고/공지 템플릿',     updatedAt: Date.now() - 345600_000 },
  { id: 'canvas-offering',       name: '헌금 안내 슬라이드',   updatedAt: Date.now() - 604800_000 },
];

// 추천 accent color palette (8색)
const ACCENT_COLORS = [
  '#7c3aed', // violet
  '#2563eb', // blue
  '#0ea5e9', // sky
  '#14b8a6', // teal
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
  '#64748b', // slate
];

// ─────────────────────────────────────────
// Props
// ─────────────────────────────────────────
interface AddSceneModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AddSceneModal({ open, onClose }: AddSceneModalProps) {
  const addScene = useMediaStore((s) => s.addScene);

  // ── 폼 상태 ──
  const [kind, setKind] = useState<SceneKind | null>(null);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [accentColor, setAccentColor] = useState<string>(ACCENT_COLORS[0]);

  // 타입별 필드
  const [sourceUrl, setSourceUrl] = useState('');
  const [canvasPageId, setCanvasPageId] = useState<string>('');
  const [countdownMin, setCountdownMin] = useState(5);
  const [countdownSec, setCountdownSec] = useState(0);

  // 열릴 때 리셋
  useEffect(() => {
    if (open) {
      setKind(null);
      setLabel('');
      setNote('');
      setAccentColor(ACCENT_COLORS[0]);
      setSourceUrl('');
      setCanvasPageId('');
      setCountdownMin(5);
      setCountdownSec(0);
    }
  }, [open]);

  // ESC 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 타입이 선택되면 기본 라벨 자동 채움 (사용자가 비워둔 경우만)
  useEffect(() => {
    if (!kind) return;
    setLabel((prev) => (prev.trim() ? prev : SCENE_KIND_LABEL[kind]));
  }, [kind]);

  // 제출 가능 여부
  const canSubmit = useMemo(() => {
    if (!kind) return false;
    if (!label.trim()) return false;
    if (kind === 'canvas' && !canvasPageId) return false;
    if ((kind === BROWSER_KIND || kind === 'image' || kind === 'video') && !sourceUrl.trim()) {
      return false;
    }
    if (kind === 'countdown') {
      const total = countdownMin * 60 + countdownSec;
      if (total <= 0) return false;
    }
    return true;
  }, [kind, label, canvasPageId, sourceUrl, countdownMin, countdownSec]);

  if (!open) return null;

  // ── 제출 ──
  const handleSubmit = () => {
    if (!kind || !canSubmit) return;

    const payload: NewSceneInput = {
      kind,
      label: label.trim(),
      note: note.trim() || undefined,
      accentColor,
    };

    if (kind === 'canvas') payload.canvasPageId = canvasPageId;
    if (kind === BROWSER_KIND || kind === 'image' || kind === 'video') {
      payload.sourceUrl = sourceUrl.trim();
    }
    if (kind === 'countdown') {
      payload.durationSec = countdownMin * 60 + countdownSec;
    }

    const id = addScene(payload);
    if (id) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-xl border border-gray-800 bg-[#0d0f14] shadow-2xl shadow-black/60 flex flex-col max-h-[90vh]">
        {/* 헤더 */}
        <header className="px-5 py-4 flex items-center justify-between border-b border-gray-800 shrink-0">
          <div>
            <h2 className="text-[13px] font-bold text-white">Scene 추가</h2>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {kind ? `${SCENE_KIND_LABEL[kind]} 설정` : '송출할 소스 타입을 선택하세요'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
            title="닫기 (ESC)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {/* 본문 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {/* Step 1: 소스 타입 픽커 */}
          {!kind && (
            <div className="grid grid-cols-3 gap-2">
              {PICKABLE_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className="aspect-[4/3] rounded-lg border border-gray-800 bg-[#0a0c10] hover:border-violet-500/60 hover:bg-violet-500/5 transition-colors flex flex-col items-center justify-center gap-1.5 text-gray-300 hover:text-white"
                >
                  <span className="text-3xl leading-none">{SCENE_KIND_ICON[k]}</span>
                  <span className="text-[10px] font-bold tracking-wider uppercase">
                    {k === BROWSER_KIND ? '브라우저' : SCENE_KIND_LABEL[k]}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Step 2: 타입별 설정 폼 */}
          {kind && (
            <>
              {/* 타입 미리보기 + 변경 버튼 */}
              <div className="flex items-center gap-3 px-3 py-2 rounded-md border border-gray-800 bg-[#0a0c10]">
                <div
                  className="w-10 h-10 rounded flex items-center justify-center text-xl shrink-0"
                  style={{ background: `${accentColor}33` }}
                >
                  {SCENE_KIND_ICON[kind]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-white">
                    {kind === BROWSER_KIND ? '브라우저' : SCENE_KIND_LABEL[kind]}
                  </p>
                  <p className="text-[10px] text-gray-500 truncate">
                    {helperForKind(kind)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setKind(null)}
                  className="text-[10px] text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-white/5"
                >
                  ← 변경
                </button>
              </div>

              {/* 타입별 필드 */}
              {(kind === 'image' || kind === 'video') && (
                <Field label={kind === 'image' ? '이미지 URL' : '영상 URL'}>
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder={
                      kind === 'image'
                        ? 'https://... 또는 로컬 파일 경로'
                        : 'https://... (MP4, WebM) 또는 로컬 파일 경로'
                    }
                    className="w-full px-3 h-9 rounded-md bg-[#0a0c10] border border-gray-800 focus:border-violet-500 text-[12px] text-white placeholder:text-gray-600 outline-none"
                  />
                  <p className="mt-1 text-[10px] text-gray-600">
                    Phase 2C 에서 로컬 파일 업로드 + 드래그앤드롭을 추가합니다.
                  </p>
                </Field>
              )}

              {kind === BROWSER_KIND && (
                <Field label="브라우저 URL">
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://youtube.com/live/... · https://docs.google.com/... 등"
                    className="w-full px-3 h-9 rounded-md bg-[#0a0c10] border border-gray-800 focus:border-violet-500 text-[12px] text-white placeholder:text-gray-600 outline-none"
                  />
                  <p className="mt-1 text-[10px] text-gray-600">
                    데스크탑의 embedded browser 창을 송출 소스로 사용합니다.
                  </p>
                </Field>
              )}

              {kind === 'canvas' && (
                <Field label="Canvas 페이지 선택">
                  <div className="max-h-48 overflow-y-auto rounded-md border border-gray-800 bg-[#0a0c10] divide-y divide-gray-800/60">
                    {MOCK_CANVAS_PAGES.map((p) => {
                      const selected = canvasPageId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setCanvasPageId(p.id);
                            if (!label.trim() || label.trim() === SCENE_KIND_LABEL.canvas) {
                              setLabel(p.name);
                            }
                          }}
                          className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-violet-500/5 ${
                            selected ? 'bg-violet-500/10' : ''
                          }`}
                        >
                          <span className="text-base">📖</span>
                          <span className="flex-1 min-w-0 text-[11px] text-white truncate">
                            {p.name}
                          </span>
                          {selected && (
                            <span className="text-[9px] font-bold text-violet-300 uppercase">
                              선택됨
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[10px] text-gray-600">
                    Canvas 에디터에서 만든 페이지를 그대로 송출 카드로 사용합니다.
                  </p>
                </Field>
              )}

              {kind === 'countdown' && (
                <Field label="카운트다운 시간">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={180}
                        value={countdownMin}
                        onChange={(e) => setCountdownMin(Math.max(0, Number(e.target.value) || 0))}
                        className="w-16 px-2 h-9 rounded-md bg-[#0a0c10] border border-gray-800 focus:border-violet-500 text-[12px] text-white tabular-nums outline-none"
                      />
                      <span className="text-[11px] text-gray-400">분</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={countdownSec}
                        onChange={(e) => setCountdownSec(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                        className="w-16 px-2 h-9 rounded-md bg-[#0a0c10] border border-gray-800 focus:border-violet-500 text-[12px] text-white tabular-nums outline-none"
                      />
                      <span className="text-[11px] text-gray-400">초</span>
                    </div>
                    <span className="ml-2 text-[10px] text-gray-500">
                      = 총 {countdownMin * 60 + countdownSec}초
                    </span>
                  </div>
                </Field>
              )}

              {kind === 'audio-cover' && (
                <Field label="오디오 + 커버 이미지 URL">
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="커버 이미지 URL (오디오 파일은 Phase 2C)"
                    className="w-full px-3 h-9 rounded-md bg-[#0a0c10] border border-gray-800 focus:border-violet-500 text-[12px] text-white placeholder:text-gray-600 outline-none"
                  />
                  <p className="mt-1 text-[10px] text-gray-600">
                    오디오 재생 + 정적 커버 이미지 (묵상 · BGM 구간 등).
                  </p>
                </Field>
              )}

              {kind === 'black' && (
                <div className="px-3 py-2 rounded-md border border-gray-800 bg-[#0a0c10] text-[11px] text-gray-400">
                  검정 화면은 별도 소스 설정이 필요 없습니다. 긴급 복귀 · 조용한 전환용으로 사용하세요.
                </div>
              )}

              {/* 공통 필드: 라벨 */}
              <Field label="라벨 *">
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="예: 환영 슬라이드"
                  className="w-full px-3 h-9 rounded-md bg-[#0a0c10] border border-gray-800 focus:border-violet-500 text-[12px] text-white placeholder:text-gray-600 outline-none"
                  maxLength={60}
                />
              </Field>

              {/* 공통 필드: 메모 */}
              <Field label="메모">
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="선택 · 카드 우하단에 표시됩니다"
                  className="w-full px-3 h-9 rounded-md bg-[#0a0c10] border border-gray-800 focus:border-violet-500 text-[12px] text-white placeholder:text-gray-600 outline-none"
                  maxLength={80}
                />
              </Field>

              {/* 공통 필드: 대표 색 */}
              <Field label="대표 색">
                <div className="flex items-center gap-1.5">
                  {ACCENT_COLORS.map((c) => {
                    const active = accentColor === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setAccentColor(c)}
                        className={`w-7 h-7 rounded-md border-2 transition-all ${
                          active
                            ? 'border-white scale-110'
                            : 'border-gray-800 hover:border-gray-600'
                        }`}
                        style={{ background: c }}
                        title={c}
                      />
                    );
                  })}
                </div>
              </Field>
            </>
          )}
        </div>

        {/* 푸터 */}
        <footer className="px-5 py-3 border-t border-gray-800 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-9 rounded-md text-[11px] font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-5 h-9 rounded-md bg-violet-600 hover:bg-violet-500 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white text-[11px] font-bold transition-colors"
          >
            Scene 추가
          </button>
        </footer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// 서브 컴포넌트
// ─────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function helperForKind(kind: SceneKind): string {
  switch (kind) {
    case 'image':
      return '정적 이미지 슬라이드 · 주보/공지/성경 구절';
    case 'video':
      return '프리레코딩 영상 · 환영/광고/찬양 MR';
    case 'window':
      return '브라우저/윈도우 캡처 · 온라인 악보 · 라이브 채팅';
    case 'canvas':
      return 'Canvas 에서 만든 페이지를 그대로 사용';
    case 'countdown':
      return '카운트다운 타이머 · 예배 시작 대기';
    case 'audio-cover':
      return '오디오 + 정적 커버 이미지 · 묵상 시간';
    case 'camera':
      return '서브 카메라 · 드론/와이드 샷';
    case 'black':
      return '검정 화면 · 긴급 복귀 · 조용한 전환';
    default:
      return '';
  }
}
