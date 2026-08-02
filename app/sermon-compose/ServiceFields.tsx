'use client';

// 참고자료 패널들이 공유하는 예배 정보 입력부.
// 도래하는 정기예배가 기본으로 잡히고, 사용자가 언제든 바꿀 수 있다.

import { SERVICE_TYPES } from '../../lib/sermon-compose/serviceTypeHint';
import { nextServiceDate } from '../../lib/nextServiceDate';

export interface ServiceFieldsValue {
  serviceType: string;
  serviceDate: string;
  title: string;
}

interface Props {
  value: ServiceFieldsValue;
  onChange: (next: ServiceFieldsValue) => void;
  /** 제목을 비웠을 때 실제로 저장될 이름 */
  autoTitle: string;
  /** 자동으로 잡힌 예배 — 사용자가 바꿨는지 알려주는 안내에 쓴다 */
  detectedServiceType: string;
  disabled?: boolean;
}

export default function ServiceFields({ value, onChange, autoTitle, detectedServiceType, disabled }: Props) {
  /* 예배 종류를 바꾸면 날짜도 그 예배의 다음 회차로 따라간다. */
  const handleServiceType = (serviceType: string) => {
    const auto = nextServiceDate(serviceType);
    onChange({ ...value, serviceType, serviceDate: auto ?? value.serviceDate });
  };

  const changed = Boolean(detectedServiceType) && detectedServiceType !== value.serviceType;

  return (
    <>
      <div className="field-grid service-fields">
        <label>
          예배 종류
          <select
            value={value.serviceType}
            onChange={(event) => handleServiceType(event.target.value)}
            disabled={disabled}
          >
            {SERVICE_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label>
          일자
          <input
            type="date"
            value={value.serviceDate}
            onChange={(event) => onChange({ ...value, serviceDate: event.target.value })}
            disabled={disabled}
          />
        </label>
      </div>

      <p className="field-program-message">
        {changed
          ? `자동으로 잡힌 예배는 ${detectedServiceType} 입니다. 지금은 ${value.serviceType} 로 바꿔 두셨습니다.`
          : `도래하는 정기예배(${value.serviceType})가 자동으로 선택됐습니다. 필요하면 바꾸세요.`}
      </p>

      <label>
        프로그램 이름
        <span className="field-hint">비워두면 {autoTitle} 으로 저장됩니다.</span>
        <input
          value={value.title}
          onChange={(event) => onChange({ ...value, title: event.target.value })}
          placeholder={autoTitle}
          disabled={disabled}
        />
      </label>
    </>
  );
}
