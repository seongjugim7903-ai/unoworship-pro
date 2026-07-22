'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { useSocketSender } from '@/hooks/useSocketSender'; // [FEATURE: SOCKET_IO]
import { buildPromptVerseContext } from '@/lib/prompt/promptVerseContext'; // [FEATURE: BIBLE_PMT]
import { isSermonTitleSection } from '@/lib/prompt/sermonTitleSection'; // [FEATURE: SCRIPTURE_PMT_EXCLUDE]
import { useKeyboard } from '@/hooks/useKeyboard';
import { Section, extractSectionDisplayText } from '@/lib/types';
import type { SocketMessageTarget } from '@/lib/socketEvents';
import { hasCustomRenderTargets } from '@/lib/canvasTypes';
import { autoPlayVideos } from '@/lib/videoAutoplay';
import { sectionHasYouTube } from '@/lib/youtubeStandby'; // [FEATURE: YT_STANDBY]
import {
  getSectionOutputElements,
  getSectionOwnElements,
} from '@/lib/fixedLayers';
import { hasMotion } from '@/lib/motionEngine';
import {
  isLayerOutputWorkspaceItem,
  isLayerOutputWorkspaceSection,
} from '@/lib/layerOutputWorkspace';
import {
  applyBackgroundMotionOnce,
  getContentSections,
  isProgramBackgroundSection,
} from '@/lib/programBackground';
import { injectNextLineIntoElements } from '@/features/scripture-next-line/nextLine'; // [FEATURE: SCRIPTURE_NEXT_LINE]
import {
  applySectionCueMacroElements,
  isPromptOnlyTargets,
  isSectionCueMacroEnabled,
  resolveSectionCueBlackoutAction,
  resolveSectionCuePromptLayout,
  resolveSectionCueTargets,
  resolveSectionCueTransitionConfig,
  resolvePromptLayoutTargets,
} from '@/lib/sectionCueMacro';
import {
  canPrerenderOutputFrameForElements,
  createOutputFrameCacheKey,
  digestOutputFrameCacheKey,
  getSharedOutputFrameCacheEntry,
  hasOutputVisibleVideo,
  hasSocketTargets,
  renderOutputFrameDataUrl,
  setSharedOutputFrameCacheEntry,
  targetsIncludeOutput,
  touchSharedOutputFrameCacheEntry,
  withOutputCacheTrace,
  withoutOutputTarget,
} from '@/lib/outputFrameTransport';
import OutputTabBar, { type OutputTab } from './output/OutputTabBar';
import AudioConsoleTab from './output/tabs/AudioConsoleTab';
import ProgramMirror from './operator/ProgramMirror';
import CameraGrid from './operator/CameraGrid';
import TransitionPanel from '@/components/scenes/TransitionPanel';

// ATEM API 호출 헬퍼
async function callAtemApi(action: string, body?: unknown) {
  const res = await fetch(`/api/atem?action=${action}`, {
    method: action === 'status' ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export default function OperatorPanel() {
  const {
    setlists,
    currentSetlistId,
    activeItemId,
    activeSectionId,
    isBlackout,
    isOutputConnected,
    globalStyle,
    atemSettings,
    youtubeStandby,
    setActiveItem,
    setActiveSection,
    setBlackout,
    setAtemSettings,
    setYouTubeStandby,
    setBroadcastSection,
    broadcastSection,
    broadcastGridOpen,
  } = useStore();

  // ATEM 연결 상태 (UI 전용, store에 저장 안 함)
  const [atemConnState, setAtemConnState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [atemError, setAtemError] = useState<string>('');
  const [showAtemSettings, setShowAtemSettings] = useState(false);

  // ── 아웃풋패널 탭 상태 ──
  // operator: 기존 섹션 전환/블랙아웃/ATEM 컨트롤
  // audio: Web Audio API 기반 콘솔 (Phase 2 플레이스홀더)
  const [activeTab, setActiveTab] = useState<OutputTab>('operator');

  const { send } = useSocketSender(); // [FEATURE: SOCKET_IO]
  const outputWindowRef = useRef<Window | null>(null);

  // ATEM 연결/해제
  const connectAtem = useCallback(async () => {
    setAtemConnState('connecting');
    setAtemError('');
    try {
      const res = await callAtemApi('connect', {
        ip: atemSettings.ip,
        config: {
          mediaSlot: atemSettings.mediaSlot,
          dskIndex: atemSettings.dskIndex,
        },
      });
      if (res.error) throw new Error(res.error);
      setAtemConnState('connected');
    } catch (e) {
      setAtemConnState('error');
      setAtemError(e instanceof Error ? e.message : String(e));
    }
  }, [atemSettings]);

  const disconnectAtem = useCallback(async () => {
    await callAtemApi('disconnect');
    setAtemConnState('disconnected');
  }, []);

  // ATEM 자막 전송 헬퍼 (OutputCanvas의 Canvas를 PNG로 변환)
  const sendSubtitleToAtem = useCallback(async (text: string) => {
    if (!atemSettings.enabled || atemConnState !== 'connected') return;
    try {
      // OutputCanvas 창에서 캔버스 PNG를 직접 render해서 전송
      // 현재는 텍스트 기반 자막을 서버에서 간단 렌더링으로 대체
      // (실제 구현 시 OutputCanvas의 toDataURL을 BroadcastChannel로 받아 전송)
      await callAtemApi('subtitle', { png: '', text });
    } catch {
      // ATEM 전송 실패는 UnoLive 동작에 영향 없음
    }
  }, [atemSettings.enabled, atemConnState]);

  const clearAtemSubtitle = useCallback(async () => {
    if (!atemSettings.enabled || atemConnState !== 'connected') return;
    try {
      await callAtemApi('clear');
    } catch {
      // silent
    }
  }, [atemSettings.enabled, atemConnState]);

  // Derive current setlist, item, section
  const currentSetlist = setlists.find((s) => s.id === currentSetlistId);
  const currentItem = currentSetlist?.items.find((i) => i.id === activeItemId);
  const currentSection = currentItem?.sections.find((s) => s.id === activeSectionId);

  // Build flat list of all sections across all items for navigation
  const allSections: { itemId: string; section: Section; itemTitle: string }[] = [];
  if (currentSetlist) {
    for (const item of currentSetlist.items) {
      if (isLayerOutputWorkspaceItem(item)) continue;
      for (const section of item.sections) {
        if (isLayerOutputWorkspaceSection(section)) continue;
        if (isProgramBackgroundSection(section)) continue;
        allSections.push({ itemId: item.id, section, itemTitle: item.title });
      }
    }
  }

  const currentIndex = allSections.findIndex(
    (s) => s.section.id === activeSectionId && s.itemId === activeItemId
  );

  const nextSection = currentIndex >= 0 && currentIndex < allSections.length - 1
    ? allSections[currentIndex + 1]
    : null;

  // Send blackout state
  // 마운트 1회차는 건너뜀 — isBlackout은 persist되지 않아 리로드 시 false로 초기화되는데,
  // 그대로 송출하면 예배 중 걸어둔 블랙아웃이 iPad 탭 리로드만으로 라이브에서 풀림
  const blackoutFirstRun = useRef(true);
  useEffect(() => {
    if (blackoutFirstRun.current) {
      blackoutFirstRun.current = false;
      return;
    }
    send({ type: 'BLACKOUT', payload: { active: isBlackout } });
  }, [isBlackout, send]);

  // [FEATURE: YT_STANDBY] 스탠바이가 걸린 섹션을 떠나면 자동 해제
  //   selectNext/Prev(화살표) 또는 다른 섹션 카드 단일 클릭으로 active 가 바뀌면
  //   스탠바이는 의미를 잃으므로 정리. (sendToOutput 경로는 이미 직접 제어하므로
  //   이 effect 는 "외부 네비게이션" 만 처리)
  useEffect(() => {
    if (!youtubeStandby) return;
    if (
      youtubeStandby.itemId !== activeItemId ||
      youtubeStandby.sectionId !== activeSectionId
    ) {
      setYouTubeStandby(null);
    }
  }, [activeItemId, activeSectionId, youtubeStandby, setYouTubeStandby]);

  // sendToOutput 함수: index가 있으면 해당 섹션으로 이동 후 send, 없으면 현재 섹션 send
  //
  // [FEATURE: YT_STANDBY]
  //   - index 가 지정된 호출(PageDown/PageUp 네비게이션) & 타겟 섹션이 YouTube 를
  //     포함 → 즉시 송출하지 않고 "송출 스탠바이" 상태로 잡아둠 (섹션 선택만).
  //   - index 가 없는 호출(Enter/Space) 은 현재 섹션 기준으로 기존 송출 경로를
  //     그대로 탐 — 스탠바이가 걸려 있었다면 여기서 자연스럽게 커밋됨.
  const sendToOutput = useCallback((index?: number) => {
    let targetSection: Section | null = null;
    let targetItem: string | null = null;

    if (index !== undefined && index >= 0 && index < allSections.length) {
      const target = allSections[index];
      targetSection = target.section;
      targetItem = target.itemId;
      setActiveItem(target.itemId);
      setActiveSection(target.section.id);
    } else {
      targetSection = currentSection ?? null;
      targetItem = activeItemId;
    }

    if (!targetSection || !targetItem) {
      send({ type: 'CLEAR_TEXT' });
      clearAtemSubtitle();
      setYouTubeStandby(null);
      setBroadcastSection(null);
      return;
    }

    if (isLayerOutputWorkspaceSection(targetSection)) {
      return;
    }

    const item = currentSetlist?.items.find((i) => i.id === targetItem);
    const cueMacro = isSectionCueMacroEnabled(targetSection) ? targetSection.cueMacro : undefined;
    const resolvedLayout = resolveSectionCuePromptLayout(cueMacro, item?.promptLayout);
    // [FEATURE: SCRIPTURE_PMT_EXCLUDE] 말씀본문(scripture) 프로그램이라도 설교 타이틀류(말씀타이틀·
    //   제목/본문·설교자) 섹션은 scripture 렌더에서 제외 → 그 섹션 송출 시엔 PMT 미적용(none)처럼.
    const promptLayout =
      resolvedLayout === 'scripture' && isSermonTitleSection(targetSection) ? 'none' : resolvedLayout;
    const baseTargets: SocketMessageTarget[] | undefined =
      item?.promptSendMode === 'prompt-only' ? ['prompt'] : undefined;
    const cueTargets = resolveSectionCueTargets(cueMacro, baseTargets);
    const messageTargets = resolvePromptLayoutTargets(promptLayout, cueTargets);
    const isPromptOnlySend = isPromptOnlyTargets(messageTargets);

    // 블랙아웃 중이면 해제. 프롬프트 전용 송출은 최종 출력 상태를 건드리지 않는다.
    const blackoutAction = resolveSectionCueBlackoutAction(cueMacro);
    if (!isPromptOnlySend) {
      if (blackoutAction === 'on') {
        setBlackout(true);
      } else if (isBlackout && blackoutAction === 'auto-off') {
        setBlackout(false);
      }
    }

    // [FEATURE: YT_STANDBY] 네비게이션 경로에서 YouTube 섹션 도착 시 ARM
    //   index 가 지정되었다는 것은 PageDown/PageUp 등 "네비게이션 + 송출" 경로.
    //   YouTube 섹션이라면 송출 없이 스탠바이만 잡고 리턴.
    //   (Enter/Space 로 현재 섹션을 커밋하는 경로는 index 가 없으므로 이 분기 우회)
    if (!isPromptOnlySend && index !== undefined && sectionHasYouTube(targetSection)) {
      setYouTubeStandby({ itemId: targetItem, sectionId: targetSection.id });
      // 에디터에는 이미 activeItem/Section 으로 표시되는 상태. 송출 안 함.
      return;
    }

    // 이 지점부터는 실제 송출 경로 — 스탠바이는 반드시 해제
    setYouTubeStandby(null);
    if (!isPromptOnlySend) {
      setBroadcastSection({ itemId: targetItem, sectionId: targetSection.id });
    }

    // send to output
    const itemStyle = item?.style;
    const mergedStyle = { ...globalStyle, ...itemStyle };

    // [FEATURE: PROMPT_LAYOUT] 프롬프트 레이아웃 + 다음 섹션 텍스트
    const targetIndex = allSections.findIndex(
      (s) => s.section.id === targetSection.id && s.itemId === targetItem
    );
    // [FIX: PROMPT_TEXT] 다음 섹션 텍스트 — 같은 프로그램(itemId) 내에서만
    const nextEntry = targetIndex >= 0 && targetIndex < allSections.length - 1
      ? allSections[targetIndex + 1]
      : null;
    const nextSection = nextEntry && nextEntry.itemId === targetItem
      ? nextEntry.section
      : null;
    const nextSectionText = nextSection ? extractSectionDisplayText(nextSection) : '';
    // [FEATURE: BIBLE_PMT] bible 레이아웃이면 프로그램 전체 절 목록 동봉 (무대 프롬프터 전체 보기)
    const verseContext = buildPromptVerseContext(item, targetSection.id, promptLayout) ?? {};

    const ownElements = applySectionCueMacroElements(getSectionOwnElements(targetSection), cueMacro);
    // [FEATURE: SCRIPTURE_NEXT_LINE] 성경본문 템플릿의 nextLine 슬롯에 다음 섹션 첫 줄 주입 (PMT 규칙 재사용)
    const elements = injectNextLineIntoElements(
      applySectionCueMacroElements(
        applyBackgroundMotionOnce(
          getSectionOutputElements(currentSetlist, targetSection),
          item,
          targetSection.id,
        ),
        cueMacro,
      ),
      nextSectionText,
    );
    const hasElements = elements.length > 0;
    const hasOwnElements = ownElements.length > 0;
    const hasText = !!targetSection.text;

    // [FIX: PROMPT_TEXT] section.text 가 비어있으면 텍스트 요소에서 추출
    const displayText = extractSectionDisplayText(targetSection);
    const sectionKind = targetSection.label === '표지' || targetSection.colorMark === '#facc15'
      ? 'cover'
      : 'default';

    // [FEATURE: SECTION_TRANSITION] 섹션 전환 효과 payload
    const sectionTransition = resolveSectionCueTransitionConfig(cueMacro, useStore.getState().sectionTransition);
    const transitionPayload = sectionTransition.type !== 'cut' && sectionTransition.duration > 0
      ? { type: sectionTransition.type, duration: sectionTransition.duration }
      : undefined;

    if (hasElements) {
      const sectionHasMotion = hasMotion(elements);
      const elementSectionText = hasOwnElements ? displayText : '';
      const outputFrameCacheKey = createOutputFrameCacheKey(targetSection.id, elements, elementSectionText);
      const hasOutputRouting = hasCustomRenderTargets(elements);
      const outputFrameDebugInfo = {
        fixedLayerCount: 0,
        ownElementCount: ownElements.length,
        outputElementCount: elements.length,
        hasOutputRouting,
        hasOutputVideo: hasOutputVisibleVideo(elements),
        outputOnlyFrame: true,
      };
      let rawElementTargets = messageTargets;
      let rawElementsSent = false;
      let outputElementsSent = false;
      const sendRawElementsUpdate = (targets: SocketMessageTarget[] | undefined) => {
        if (!hasSocketTargets(targets)) return;
        send({
          type: 'ELEMENTS_UPDATE',
          targets,
          payload: {
            elements,
            sectionText: elementSectionText,
            promptLayout,
            nextSectionText,
            sectionKind,
            transition: transitionPayload,
            ...verseContext,
          },
        });
        if (targetsIncludeOutput(targets)) outputElementsSent = true;
        rawElementsSent = true;
      };

      if (
        canPrerenderOutputFrameForElements({
          elements,
          hasMotion: sectionHasMotion,
          targets: messageTargets,
        })
      ) {
        // 프롬프트/브로드캐스트 원본 요소는 output 프레임 작업보다 먼저 보내 지연 체감을 줄인다.
        rawElementTargets = withoutOutputTarget(messageTargets);
        sendRawElementsUpdate(rawElementTargets);

        const cachedOutputFrame = getSharedOutputFrameCacheEntry(targetSection.id, outputFrameCacheKey);
        if (cachedOutputFrame) {
          touchSharedOutputFrameCacheEntry(targetSection.id, cachedOutputFrame);
          send(withOutputCacheTrace({
            type: 'FRAME_SHOW',
            targets: ['output'],
            payload: {
              sectionId: targetSection.id,
              sectionText: displayText,
              hasMotion: false,
              promptLayout,
              nextSectionText,
              sectionKind,
              transition: transitionPayload,
            },
          }, {
            ...outputFrameDebugInfo,
            cachePhase: 'operator-output-only',
            cacheDecision: 'hit-frame-show',
            cacheReason: 'shared-output-cache-hit',
            cacheKeyDigest: digestOutputFrameCacheKey(outputFrameCacheKey),
            cacheAgeMs: Date.now() - cachedOutputFrame.cachedAt,
          }));
        } else {
          const frame = renderOutputFrameDataUrl(elements, elementSectionText);
          if (frame) {
            setSharedOutputFrameCacheEntry({
              sectionId: targetSection.id,
              frame,
              text: elementSectionText,
              cacheKey: outputFrameCacheKey,
            });
            send(withOutputCacheTrace({
              type: 'FRAME_CACHE',
              targets: ['output'],
              payload: { sectionId: targetSection.id, frame },
            }, {
              ...outputFrameDebugInfo,
              cachePhase: 'operator-output-only',
              cacheDecision: 'store-frame-cache',
              cacheReason: 'store-before-frame-show',
              cacheKeyDigest: digestOutputFrameCacheKey(outputFrameCacheKey),
            }));
            send(withOutputCacheTrace({
              type: 'FRAME_SHOW',
              targets: ['output'],
              payload: {
                sectionId: targetSection.id,
                sectionText: displayText,
                hasMotion: false,
                promptLayout,
                nextSectionText,
                sectionKind,
                transition: transitionPayload,
              },
            }, {
              ...outputFrameDebugInfo,
              cachePhase: 'operator-output-only',
              cacheDecision: 'miss-store-show',
              cacheReason: 'shared-output-cache-miss-frame-cache-sent',
              cacheKeyDigest: digestOutputFrameCacheKey(outputFrameCacheKey),
            }));
          } else {
            sendRawElementsUpdate(['output']);
          }
        }
      }

      // 캔버스 요소 원본은 필요한 화면에만 보낸다.
      if (!rawElementsSent) {
        sendRawElementsUpdate(rawElementTargets);
      }
      if (!outputElementsSent && targetsIncludeOutput(messageTargets)) {
        sendRawElementsUpdate(['output']);
      }
      if (!hasOwnElements && hasText) {
        send({
          type: 'SUBTITLE_UPDATE',
          targets: messageTargets,
          payload: {
            text: targetSection.text,
            style: mergedStyle,
            promptLayout,
            nextSectionText,
            sectionKind,
            transition: transitionPayload,
            ...verseContext,
          },
        });
      }
      // 비디오 요소 자동 재생 (에디터 + 송출 PC, 재시도 로직 포함)
      autoPlayVideos(elements, { targets: messageTargets });
    } else if (hasText) {
      // 텍스트만 있으면 → 이전 캔버스 요소 클리어 + SUBTITLE_UPDATE
      send({ type: 'ELEMENTS_UPDATE', targets: messageTargets, payload: { elements: [], sectionText: '', promptLayout, nextSectionText, sectionKind, transition: transitionPayload, ...verseContext } });
      send({ type: 'SUBTITLE_UPDATE', targets: messageTargets, payload: { text: targetSection.text, style: mergedStyle, promptLayout, nextSectionText, sectionKind, transition: transitionPayload, ...verseContext } });
    } else {
      // 빈 섹션 → 화면 클리어 (카메라만 보임)
      send({ type: 'ELEMENTS_UPDATE', targets: messageTargets, payload: { elements: [], sectionText: '', promptLayout, nextSectionText, sectionKind, transition: transitionPayload, ...verseContext } });
      send({ type: 'SUBTITLE_UPDATE', targets: messageTargets, payload: { text: '', style: mergedStyle, promptLayout, nextSectionText, sectionKind, transition: transitionPayload, ...verseContext } });
    }

    // ATEM 연동: 섹션 전환 시 DSK 자막 업데이트
    if (!isPromptOnlySend) {
      sendSubtitleToAtem(targetSection.text);
    }
  }, [allSections, currentSection, activeItemId, currentSetlist, isBlackout, globalStyle, setActiveItem, setActiveSection, setBlackout, setYouTubeStandby, setBroadcastSection, send, sendSubtitleToAtem, clearAtemSubtitle]);

  // [FIX: STALE CLOSURE] goNext/goPrev는 sendToOutput(index)에 명시적 인덱스를 전달.
  // 이전 방식(setActiveSection 후 sendToOutput())은 클로저가 이전 섹션을 참조해서 버그 발생.
  // sendToOutput(index) 내부에서 setActiveItem/setActiveSection도 함께 처리함.
  const goNext = useCallback(() => {
    if (allSections.length === 0) return;
    if (currentIndex < 0) {
      sendToOutput(0);
    } else if (currentIndex < allSections.length - 1) {
      sendToOutput(currentIndex + 1);
    }
  }, [allSections, currentIndex, sendToOutput]);

  const goPrev = useCallback(() => {
    if (allSections.length === 0 || currentIndex <= 0) return;
    sendToOutput(currentIndex - 1);
  }, [allSections, currentIndex, sendToOutput]);
  // [/FIX: STALE CLOSURE]

  // [REMOVED 2026-07-08] 카메라 타일 더블클릭 동시 송출 — 운영 결정으로 제거.

  // [FEATURE: SELECT_ONLY] 화살표 키/버튼용 — 에디터 섹션 선택만, 아웃풋 송출 없음
  const selectNext = useCallback(() => {
    if (allSections.length === 0) return;
    if (currentIndex < 0) {
      const first = allSections[0];
      setActiveItem(first.itemId);
      setActiveSection(first.section.id);
    } else if (currentIndex < allSections.length - 1) {
      const next = allSections[currentIndex + 1];
      setActiveItem(next.itemId);
      setActiveSection(next.section.id);
    }
  }, [allSections, currentIndex, setActiveItem, setActiveSection]);

  const selectPrev = useCallback(() => {
    if (allSections.length === 0 || currentIndex <= 0) return;
    const prev = allSections[currentIndex - 1];
    setActiveItem(prev.itemId);
    setActiveSection(prev.section.id);
  }, [allSections, currentIndex, setActiveItem, setActiveSection]);

  // [FEATURE: PROGRAM_NAV] ↑/↓ — 프로그램(item) 사이 이동. 이동 시 해당 프로그램의 첫 섹션 선택.
  //   [FEATURE: BROADCAST_GRID] 단, 송출 그리드가 열려 있으면 첫 섹션 자동 선택을 억제한다
  //   (그리드 뷰가 프로그램 이동만으로 첫 섹션으로 튀지 않게 — activeItem 만 이동).
  const selectNextProgram = useCallback(() => {
    const items = currentSetlist?.items ?? [];
    if (items.length === 0) return;
    const idx = items.findIndex((it) => it.id === activeItemId);
    const item = items[idx < 0 ? 0 : Math.min(idx + 1, items.length - 1)];
    if (!item) return;
    setActiveItem(item.id);
    if (!broadcastGridOpen) setActiveSection(getContentSections(item)[0]?.id ?? null);
  }, [currentSetlist, activeItemId, setActiveItem, setActiveSection, broadcastGridOpen]);

  const selectPrevProgram = useCallback(() => {
    const items = currentSetlist?.items ?? [];
    if (items.length === 0) return;
    const idx = items.findIndex((it) => it.id === activeItemId);
    const item = items[idx <= 0 ? 0 : idx - 1];
    if (!item) return;
    setActiveItem(item.id);
    if (!broadcastGridOpen) setActiveSection(getContentSections(item)[0]?.id ?? null);
  }, [currentSetlist, activeItemId, setActiveItem, setActiveSection, broadcastGridOpen]);
  // [/FEATURE: SELECT_ONLY]

  const toggleBlackout = useCallback(() => {
    setBlackout(!isBlackout);
  }, [isBlackout, setBlackout]);

  const clearText = useCallback(() => {
    setActiveSection(null);
    send({ type: 'CLEAR_TEXT' });
    clearAtemSubtitle();
  }, [setActiveSection, send, clearAtemSubtitle]);

  const openOutput = useCallback(() => {
    if (outputWindowRef.current && !outputWindowRef.current.closed) {
      outputWindowRef.current.focus();
    } else {
      outputWindowRef.current = window.open(
        '/main',
        'unoLive-main',
        'popup'
      );
    }
  }, []);

  // 키보드 단축키 (→/←: 선택만 / PageDown/PageUp: 이동+송출)
  useKeyboard({ selectNext, selectPrev, selectNextProgram, selectPrevProgram, goNext, goPrev, toggleBlackout, clearText, openOutput, sendToOutput });

  return (
    <div className="flex flex-col h-full bg-[#111111] border-l border-[#222222] text-white">
      {/* 탭 바 — 아웃풋패널 상단 */}
      <OutputTabBar active={activeTab} onChange={setActiveTab} />

      {/* 오디오 탭 — Phase 2 플레이스홀더 */}
      {activeTab === 'audio' && (
        <div className="flex-1 min-h-0">
          <AudioConsoleTab />
        </div>
      )}

      {/* 오퍼레이터 탭 — 기존 전체 컨트롤 */}
      {activeTab === 'operator' && (
        <div className="flex flex-col flex-1 min-h-0">
      {/* Status bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#222222]">
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full ${
            isOutputConnected ? 'bg-red-500 animate-pulse' : 'bg-gray-600'
          }`}
        />
        <span className="text-sm font-medium">
          {isOutputConnected ? 'LIVE' : 'Offline'}
        </span>
        <span className="text-xs text-gray-500 ml-auto">
          {isOutputConnected ? 'Output 연결됨' : 'Output 없음'}
        </span>
      </div>

      {/* Current output */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* [PGM_MIRROR] 최종 송출 화면 16:9 미러 */}
        <ProgramMirror />

        {/* [CAMERA_GRID] 카메라 4분할 프리뷰 */}
        <CameraGrid />

        {/* [TRANSITION / RESERVED] 4분할 하단 2-슬롯 박스
              위 슬롯: Section Transition 컨트롤 (MAIN · SUB · 대시보드 미러에 적용)
              아래 슬롯: 예약 — 향후 기능용 (플레이스홀더) */}
        <div className="px-4 py-3 border-b border-[#222222] space-y-2">
          {/* 슬롯 1 — Section Transition (PageDown/Enter/TAKE 송출 시 적용) */}
          <TransitionPanel variant="standard" mode="section" showActions={false} />

          {/* 슬롯 2 — 예약 (향후 기능) */}
          <div className="bg-[#141414] rounded-lg border border-dashed border-[#2a2a2a] p-3 min-h-[60px] flex items-center justify-center">
            <span className="text-[10px] text-gray-600">
              예약 슬롯 (향후 기능)
            </span>
          </div>
        </div>

      </div>

      {/* Controls 영역 전체 제거됨 —
            ATEM 연동 UI 는 우측 패널에서 삭제 (향후 설정 페이지 이동 예정).
            섹션 전환·블랙아웃·Output 창 열기 버튼도 이미 제거.
            키보드 단축키(←/→, PageUp/PageDown, Esc, B, O)는 여전히 동작 (useKeyboard). */}
        </div>
      )}
    </div>
  );
}
