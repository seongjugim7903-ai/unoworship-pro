'use client';

// 교회소식 입력 폼 — 빈 줄(엔터 두 번)마다 소식 한 건이 한 섹션이 된다.
// 나뉜 결과를 오른쪽에 그대로 보여 줘서, 저장 전에 몇 장이 만들어질지 눈으로 확인하게 한다.

import { useMemo, useState } from 'react';
import { MAX_ITEMS_PER_PROGRAM, defaultSubProgramTitle } from '../../lib/sermon-compose/subProgram';
import { splitNewsBlocks } from '../../lib/sermon-compose/churchNews';
import { getUpcomingService } from '../../lib/sermon-compose/upcomingService';
import ServiceFields, { type ServiceFieldsValue } from './ServiceFields';

type Status = 'idle' | 'saving' | 'done' | 'error';

const PLACEHOLDER = `매주 목요일은 울주전도의 날로 실천합니다.

8월 1일(토) 월삭감사예배를 드립니다.

새가족 환영회가 다음 주일 오후에 있습니다.`;

export default function SermonChurchNewsPanel() {
  /* 도래하는 정기예배를 기본값으로 잡는다 — 렌더마다 시각이 흔들리지 않게 한 번만 계산한다. */
  const upcoming = useMemo(() => getUpcomingService(), []);
  const [fields, setFields] = useState<ServiceFieldsValue>({
    serviceType: upcoming.serviceType,
    serviceDate: upcoming.serviceDate,
    title: '',
  });
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  const blocks = useMemo(() => splitNewsBlocks(content), [content]);
  const autoTitle = defaultSubProgramTitle(fields.serviceDate, fields.serviceType, 'news');
  const busy = status === 'saving';
  const tooMany = blocks.length > MAX_ITEMS_PER_PROGRAM;
  const canSave = blocks.length > 0 && !tooMany && !busy;

  const handleSave = async () => {
    if (!canSave) return;

    setStatus('saving');
    setMessage('교회소식 프로그램을 저장하고 있습니다...');
    try {
      const response = await fetch('/api/sermon-compose/news-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceType: fields.serviceType,
          serviceDate: fields.serviceDate,
          title: fields.title.trim(),
          content: content.trim(),
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean; message?: string; title?: string; itemCount?: number;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.message ?? `저장에 실패했습니다. (HTTP ${response.status})`);
      }

      setStatus('done');
      setMessage(`교회소식 프로그램 저장 완료 · ${result.title} · ${result.itemCount}건`);
    } catch (error) {
      console.error('[sermon-news-program] save failed', error);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.');
    }
  };

  return (
    <main className="site-shell">
      <div className="content-grid">
        <section className="panel form-panel">
          <div className="panel-heading">
            <div><span className="step-number">01</span><h2>교회소식</h2></div>
            <span className="required-note">* 소식 1건 이상</span>
          </div>

          <ServiceFields
            value={fields}
            onChange={setFields}
            autoTitle={autoTitle}
            detectedServiceType={upcoming.serviceType}
            disabled={busy}
          />

          <label>
            소식 내용 *
            <span className="field-hint">빈 줄(엔터 두 번)로 나누면 소식마다 자막 한 장이 만들어집니다.</span>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={PLACEHOLDER}
              rows={14}
              disabled={busy}
            />
          </label>

          <button className="primary-button" onClick={() => void handleSave()} disabled={!canSave}>
            {busy ? '저장 중...' : `교회소식 프로그램 저장${blocks.length > 0 ? ` (${blocks.length}건)` : ''}`}
          </button>
          {tooMany && (
            <p className="error-message">
              소식은 한 프로그램에 {MAX_ITEMS_PER_PROGRAM}건까지 넣을 수 있습니다. 지금 {blocks.length}건입니다.
            </p>
          )}
          {message && <p className={`field-program-message ${status}`}>{message}</p>}
        </section>

        <section className="panel preview-panel">
          <div className="panel-heading">
            <div><span className="step-number success">02</span><h2>섹션 미리보기</h2></div>
            <span className="section-count">{blocks.length}건</span>
          </div>

          {blocks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">소식</div>
              <p>빈 줄로 나눈 소식이<br />여기에 한 장씩 표시됩니다.</p>
            </div>
          ) : (
            <div className="text-preview-list">
              {blocks.map((block, index) => (
                <article className="text-preview" key={`${index}-${block.slice(0, 12)}`}>
                  <span>{index + 1}</span>
                  <p>{block}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <footer className="page-footer">UnoWorship Pro · 헵시바 선교단</footer>
    </main>
  );
}
