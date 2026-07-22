'use client';

/**
 * EditorSettings — 에디터 설정
 *  - 그리드, 스마트 가이드, 스냅
 *  - 화살표 넛지 단위
 *  - 빈 텍스트 자동 삭제
 */

import { useSettings } from '@/hooks/settings/useSettings';
import { Section, Row, Toggle, NumberInput } from './_fields';

export default function EditorSettings() {
  const { editor, updateEditor, resetEditor } = useSettings();

  return (
    <div>
      <Section
        title="표시 옵션"
        description="에디터 캔버스에 표시되는 보조 가이드를 설정합니다."
      >
        <Row label="그리드 표시">
          <Toggle
            checked={editor.showGrid}
            onChange={(v) => updateEditor({ showGrid: v })}
          />
        </Row>
        <Row label="스마트 가이드" hint="요소 간 중앙/모서리 정렬 가이드">
          <Toggle
            checked={editor.showSmartGuides}
            onChange={(v) => updateEditor({ showSmartGuides: v })}
          />
        </Row>
      </Section>

      <Section title="스냅">
        <Row label="요소 스냅" hint="드래그/리사이즈 시 다른 요소에 달라붙기">
          <Toggle
            checked={editor.snapEnabled}
            onChange={(v) => updateEditor({ snapEnabled: v })}
          />
        </Row>
        <Row label="스냅 임계값" hint="이 거리 이내에서 스냅이 발동합니다.">
          <NumberInput
            value={editor.snapThreshold}
            onChange={(v) => updateEditor({ snapThreshold: v })}
            min={0}
            max={30}
            step={1}
            suffix="px"
          />
        </Row>
      </Section>

      <Section
        title="키보드 넛지"
        description="화살표 키로 요소를 이동하는 단위입니다. (% 기준)"
      >
        <Row label="기본 넛지" hint="화살표 키만 눌렀을 때">
          <NumberInput
            value={editor.nudgeUnit}
            onChange={(v) => updateEditor({ nudgeUnit: v })}
            min={0.01}
            max={5}
            step={0.05}
            suffix="%"
          />
        </Row>
        <Row label="큰 넛지" hint="Shift + 화살표 키">
          <NumberInput
            value={editor.nudgeUnitLarge}
            onChange={(v) => updateEditor({ nudgeUnitLarge: v })}
            min={0.1}
            max={20}
            step={0.1}
            suffix="%"
          />
        </Row>
      </Section>

      <Section title="텍스트 편집">
        <Row
          label="빈 텍스트 자동 삭제"
          hint="텍스트 편집 완료 시 내용이 비어있으면 자동으로 삭제합니다."
        >
          <Toggle
            checked={editor.autoDeleteEmptyText}
            onChange={(v) => updateEditor({ autoDeleteEmptyText: v })}
          />
        </Row>
      </Section>

      <div className="pt-2 border-t border-[#1a1a1a]">
        <button
          onClick={resetEditor}
          className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          에디터 설정 초기화
        </button>
      </div>
    </div>
  );
}
