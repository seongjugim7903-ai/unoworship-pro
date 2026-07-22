'use client';

/**
 * BroadcastSettings — 송출 글로벌 정책 설정
 *  - 라이브 종료 확인
 *  - 녹화 자동 다운로드
 *  - 자동 재연결
 *
 * 스트림 키, RTMP URL 등 세부 설정은 라이브 버튼의 LiveSetupModal에서 관리.
 */

import { useSettings } from '@/hooks/settings/useSettings';
import { useBroadcastStore } from '@/lib/broadcast/broadcastStore';
import { Section, Row, Toggle, Select, NumberInput } from './_fields';
import type { RecordingQuality, RecordingSettings } from '@/lib/broadcast/broadcastTypes';

export default function BroadcastSettings() {
  const { broadcastGlobal, updateBroadcastGlobal, resetBroadcastGlobal } =
    useSettings();

  const recordingSettings = useBroadcastStore((s) => s.recordingSettings);
  const updateRecordingSettings = useBroadcastStore(
    (s) => s.updateRecordingSettings,
  );

  return (
    <div>
      <Section title="녹화">
        <Row label="녹화 품질">
          <Select<RecordingQuality>
            value={recordingSettings.quality}
            onChange={(v) => updateRecordingSettings({ quality: v })}
            options={[
              { value: '480p', label: '480p' },
              { value: '720p', label: '720p' },
              { value: '1080p', label: '1080p' },
            ]}
          />
        </Row>
        <Row label="프레임레이트">
          <Select<'30' | '60'>
            value={String(recordingSettings.fps) as '30' | '60'}
            onChange={(v) =>
              updateRecordingSettings({ fps: Number(v) as 30 | 60 })
            }
            options={[
              { value: '30', label: '30 fps' },
              { value: '60', label: '60 fps' },
            ]}
          />
        </Row>
        <Row label="오디오 소스">
          <Select<'none' | 'microphone' | 'system' | 'both'>
            value={recordingSettings.audioSource}
            onChange={(v) => updateRecordingSettings({ audioSource: v })}
            options={[
              { value: 'none', label: '없음' },
              { value: 'microphone', label: '마이크' },
              { value: 'system', label: '시스템' },
              { value: 'both', label: '마이크 + 시스템' },
            ]}
          />
        </Row>
        <Row
          label="파일 포맷"
          hint="MP4는 유튜브 업로드와 일반 편집 프로그램 호환성이 가장 좋습니다."
        >
          <Select<RecordingSettings['format']>
            value={recordingSettings.format}
            onChange={(v) => updateRecordingSettings({ format: v })}
            options={[
              { value: 'mp4', label: 'MP4 (권장)' },
              { value: 'mov', label: 'MOV' },
              { value: 'webm', label: 'WebM' },
            ]}
          />
        </Row>
        <Row
          label="녹화 종료 시 자동 다운로드"
          hint="녹화 종료 시 파일을 자동으로 다운로드 받습니다."
        >
          <Toggle
            checked={broadcastGlobal.autoDownloadRecording}
            onChange={(v) => updateBroadcastGlobal({ autoDownloadRecording: v })}
          />
        </Row>
      </Section>

      <Section title="라이브">
        <Row
          label="종료 전 확인"
          hint="라이브 버튼을 눌러 종료할 때 확인 대화상자를 표시합니다."
        >
          <Toggle
            checked={broadcastGlobal.confirmOnStopLive}
            onChange={(v) => updateBroadcastGlobal({ confirmOnStopLive: v })}
          />
        </Row>
        <Row
          label="자동 재연결"
          hint="네트워크 끊김 발생 시 자동으로 재연결을 시도합니다."
        >
          <Toggle
            checked={broadcastGlobal.autoReconnect}
            onChange={(v) => updateBroadcastGlobal({ autoReconnect: v })}
          />
        </Row>
        <Row label="재연결 시도 횟수">
          <NumberInput
            value={broadcastGlobal.reconnectAttempts}
            onChange={(v) => updateBroadcastGlobal({ reconnectAttempts: v })}
            min={0}
            max={10}
            step={1}
            suffix="회"
          />
        </Row>
      </Section>

      <div className="flex items-start gap-2 px-3 py-2 bg-blue-900/20 border border-blue-900/40 rounded text-[10px] text-blue-300/90 mb-4">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="flex-shrink-0 mt-[1px]"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>
          스트림 키, RTMP URL 등 송출 대상 세부 설정은 상단 메뉴의{' '}
          <strong>라이브</strong> 버튼을 눌러 설정하세요. 실제 스트리밍 엔진은
          Phase 2에서 활성화됩니다.
        </span>
      </div>

      <div className="pt-2 border-t border-[#1a1a1a]">
        <button
          onClick={resetBroadcastGlobal}
          className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          송출 설정 초기화
        </button>
      </div>
    </div>
  );
}
