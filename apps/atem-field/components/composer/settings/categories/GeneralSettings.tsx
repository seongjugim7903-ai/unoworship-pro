'use client';

/**
 * GeneralSettings — 일반 설정
 *  - 언어
 *  - 테마 (현재 UnoLive는 다크모드만, 향후 라이트/시스템 지원)
 *  - 자동 저장 간격
 *  - 세션 복원
 */

import { useSettings } from '@/hooks/settings/useSettings';
import { Section, Row, Toggle, Select, NumberInput } from './_fields';
import type { AppLanguage, AppTheme } from '@/lib/settings/settingsTypes';

export default function GeneralSettings() {
  const { general, updateGeneral, resetGeneral } = useSettings();

  return (
    <div>
      <Section title="언어 및 테마">
        <Row label="언어" hint="인터페이스 언어를 선택합니다.">
          <Select<AppLanguage>
            value={general.language}
            onChange={(v) => updateGeneral({ language: v })}
            options={[
              { value: 'ko', label: '한국어' },
              { value: 'en', label: 'English' },
            ]}
          />
        </Row>
        <Row label="테마" hint="현재 Phase 1에서는 다크 모드만 지원합니다.">
          <Select<AppTheme>
            value={general.theme}
            onChange={(v) => updateGeneral({ theme: v })}
            options={[
              { value: 'dark', label: '다크' },
              { value: 'light', label: '라이트 (준비중)' },
              { value: 'system', label: '시스템 (준비중)' },
            ]}
          />
        </Row>
      </Section>

      <Section title="자동 저장 및 세션">
        <Row
          label="자동 저장 간격"
          hint="0으로 설정 시 자동 저장을 끕니다."
        >
          <NumberInput
            value={general.autoSaveInterval}
            onChange={(v) => updateGeneral({ autoSaveInterval: v })}
            min={0}
            max={300}
            step={5}
            suffix="초"
          />
        </Row>
        <Row
          label="마지막 세션 자동 복원"
          hint="UnoLive를 다시 열 때 마지막으로 열었던 워십을 자동 로드합니다."
        >
          <Toggle
            checked={general.restoreLastSession}
            onChange={(v) => updateGeneral({ restoreLastSession: v })}
          />
        </Row>
      </Section>

      <div className="pt-2 border-t border-[#1a1a1a]">
        <button
          onClick={resetGeneral}
          className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          일반 설정 초기화
        </button>
      </div>
    </div>
  );
}
