'use client';

/**
 * OutputSettings — 아웃풋(송출 창) 설정
 *  - 해상도
 *  - 풀스크린 모니터
 *  - 전환 효과
 *  - 배경색
 */

import { useSettings } from '@/hooks/settings/useSettings';
import { Section, Row, Select, NumberInput, ColorInput } from './_fields';
import type {
  OutputResolution,
  OutputTransition,
} from '@/lib/settings/settingsTypes';

export default function OutputSettings() {
  const { output, updateOutput, resetOutput } = useSettings();

  return (
    <div>
      <Section
        title="해상도"
        description="아웃풋 창(Output Window)의 기본 해상도입니다."
      >
        <Row label="해상도">
          <Select<OutputResolution>
            value={output.resolution}
            onChange={(v) => updateOutput({ resolution: v })}
            options={[
              { value: '720p', label: '720p (1280×720)' },
              { value: '1080p', label: '1080p (1920×1080)' },
              { value: '4k', label: '4K (3840×2160)' },
            ]}
          />
        </Row>
        <Row
          label="풀스크린 모니터"
          hint="송출용 외부 모니터 번호. -1은 자동."
        >
          <NumberInput
            value={output.fullscreenMonitor}
            onChange={(v) => updateOutput({ fullscreenMonitor: v })}
            min={-1}
            max={8}
            step={1}
          />
        </Row>
      </Section>

      <Section
        title="섹션 전환 효과"
        description="섹션을 전환할 때 적용되는 애니메이션입니다."
      >
        <Row label="전환 효과">
          <Select<OutputTransition>
            value={output.transition}
            onChange={(v) => updateOutput({ transition: v })}
            options={[
              { value: 'none', label: '없음' },
              { value: 'cut', label: '컷 (즉시)' },
              { value: 'fade', label: '페이드' },
              { value: 'slide', label: '슬라이드' },
            ]}
          />
        </Row>
        <Row label="전환 지속시간">
          <NumberInput
            value={output.transitionDuration}
            onChange={(v) => updateOutput({ transitionDuration: v })}
            min={0}
            max={2000}
            step={50}
            suffix="ms"
          />
        </Row>
      </Section>

      <Section title="배경">
        <Row label="배경색" hint="요소가 없는 영역의 배경색입니다.">
          <ColorInput
            value={output.backgroundColor}
            onChange={(v) => updateOutput({ backgroundColor: v })}
          />
        </Row>
      </Section>

      <div className="pt-2 border-t border-[#1a1a1a]">
        <button
          onClick={resetOutput}
          className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          아웃풋 설정 초기화
        </button>
      </div>
    </div>
  );
}
