'use client';

// 설교대지 원문 저장 — 기존 SermonOutlinePage 를 대체하는 새 구현.
// 달라진 점: 찬양 칸 하나를 '찬송가'와 '찬양(PPT)' 둘로 나누고 각각 자기 프로그램이 된다.
//
// 찬송가 가사와 찬양 슬라이드는 이 앱에 원본이 없다. 장 번호와 곡명만 적어 보내고
// 현장 UnoLive 가 /api/hymn 과 PPT 변환본에서 찾아 채운다.

import { useMemo, useState } from 'react';
import { defaultSubProgramTitle, parseHymnNumber } from '../../lib/sermon-compose/subProgram';
import { getUpcomingService } from '../../lib/sermon-compose/upcomingService';
import { parseSermonOutline } from '../../lib/sermon-compose/parseSermonOutline';
import ServiceFields, { type ServiceFieldsValue } from './ServiceFields';

type Status = 'idle' | 'saving' | 'done' | 'error';

interface SavedSubProgram {
  kind: string;
  title: string;
  itemCount: number;
}

const PLACEHOLDER = `주일 오전예배 대지 참조구절 및 찬양입니다.
성경: 요14:1-3
제목: 마음에 근심하지 말라!
1. 마음에 근심하지 말라 하심(1)
빌4:6-7
고후7:10`;

/** '310장, 493장' 처럼 줄바꿈·쉼표 아무렇게나 적어도 장 번호만 뽑는다 */
function readHymnNumbers(raw: string): { numbers: number[]; rejected: string[] } {
  const numbers: number[] = [];
  const rejected: string[] = [];
  for (const token of raw.split(/[\n,，·]/)) {
    const item = token.trim();
    if (!item) continue;
    const num = parseHymnNumber(item);
    if (num === null) rejected.push(item);
    else if (!numbers.includes(num)) numbers.push(num);
  }
  return { numbers, rejected };
}

/** 곡명은 줄 단위로 읽는다 — 곡명에 쉼표가 들어갈 수 있어 쉼표로 자르지 않는다 */
function readPraiseSongs(raw: string): string[] {
  const songs: string[] = [];
  for (const line of raw.split('\n')) {
    const name = line.trim();
    if (name && !songs.includes(name)) songs.push(name);
  }
  return songs;
}

export default function SermonOutlinePanel() {
  /* 도래하는 정기예배를 기본값으로 잡는다 — 렌더마다 시각이 흔들리지 않게 한 번만 계산한다. */
  const upcoming = useMemo(() => getUpcomingService(), []);
  const [fields, setFields] = useState<ServiceFieldsValue>({
    serviceType: upcoming.serviceType,
    serviceDate: upcoming.serviceDate,
    title: '',
  });
  const [content, setContent] = useState('');
  const [hymnText, setHymnText] = useState('');
  const [praiseText, setPraiseText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState<SavedSubProgram[]>([]);

  const hymns = useMemo(() => readHymnNumbers(hymnText), [hymnText]);
  const praises = useMemo(() => readPraiseSongs(praiseText), [praiseText]);
  const parsed = useMemo(() => parseSermonOutline(content), [content]);

  const hymnTitle = defaultSubProgramTitle(fields.serviceDate, fields.serviceType, 'hymn');
  const praiseTitle = defaultSubProgramTitle(fields.serviceDate, fields.serviceType, 'praise');
  const busy = status === 'saving';
  const canSave = content.trim().length > 0 && !busy;

  const quoteCount = parsed.points.reduce((sum, point) => sum + point.quotes.length, 0);

  const handleSave = async () => {
    if (!canSave) return;

    setStatus('saving');
    setMessage('설교대지와 프로그램을 저장하고 있습니다...');
    setSaved([]);
    try {
      const response = await fetch('/api/sermon-compose/outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceType: fields.serviceType,
          serviceDate: fields.serviceDate,
          content: content.trim(),
          hymnTitle,
          praiseTitle,
          hymns: hymns.numbers.map((number) => ({ number, caption: '' })),
          praises: praises.map((songName) => ({ songName, caption: '' })),
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean; message?: string;
        pointCount?: number; quoteCount?: number;
        subPrograms?: SavedSubProgram[];
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.message ?? `저장에 실패했습니다. (HTTP ${response.status})`);
      }

      setStatus('done');
      setSaved(result.subPrograms ?? []);
      setMessage(`설교대지 저장 완료 · 대지 ${result.pointCount}개 · 인용 ${result.quoteCount}개`);
    } catch (error) {
      console.error('[sermon-compose-outline] save failed', error);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.');
    }
  };

  return (
    <main className="site-shell">
      <div className="content-grid">
        <section className="panel form-panel">
          <div className="panel-heading">
            <div><span className="step-number">01</span><h2>설교대지 (정기예배마다)</h2></div>
            <span className="required-note">* 내용 필수</span>
          </div>

          <ServiceFields
            value={fields}
            onChange={setFields}
            autoTitle={`${hymnTitle} · ${praiseTitle}`}
            detectedServiceType={upcoming.serviceType}
            showTitle={false}
            disabled={busy}
          />

          <label>
            내용 *
            <span className="field-hint">설교대지 원문을 그대로 붙여넣으세요.</span>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={PLACEHOLDER}
              rows={12}
              disabled={busy}
            />
          </label>

          <label>
            찬송가
            <span className="field-hint">장 번호만 적으세요. 가사는 현장에서 자동으로 채웁니다.</span>
            <textarea
              className="hymn-input"
              value={hymnText}
              onChange={(event) => setHymnText(event.target.value)}
              placeholder={'310장, 493장, 382장'}
              rows={2}
              disabled={busy}
            />
          </label>
          {hymns.rejected.length > 0 && (
            <p className="error-message">장 번호로 읽지 못한 항목: {hymns.rejected.join(', ')}</p>
          )}

          <label>
            찬양 (PPT)
            <span className="field-hint">곡명을 한 줄에 하나씩. 현장의 PPT 변환본에서 찾아 씁니다.</span>
            <textarea
              className="hymn-input"
              value={praiseText}
              onChange={(event) => setPraiseText(event.target.value)}
              placeholder={'주님 내 길 예비하시니\n나의 하나님'}
              rows={3}
              disabled={busy}
            />
          </label>

          <button className="primary-button" onClick={() => void handleSave()} disabled={!canSave}>
            {busy ? '저장 중...' : '설교대지 저장'}
          </button>
          {message && <p className={`field-program-message ${status}`}>{message}</p>}

          {saved.length > 0 && (
            <div className="setlist-preview">
              <p className="setlist-preview-label">함께 만들어진 프로그램</p>
              <ol>
                {saved.map((program) => (
                  <li key={program.title}>
                    <span>{program.kind === 'hymn' ? '찬' : '찬'}</span>
                    <p>{program.title} · {program.itemCount}개</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        <section className="panel preview-panel">
          <div className="panel-heading">
            <div><span className="step-number success">02</span><h2>분리 결과 미리보기</h2></div>
            <span className="section-count">대지 {parsed.points.length}개</span>
          </div>

          {content.trim().length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">대지</div>
              <p>원문을 붙여넣으면 제목·본문·대지·인용구절로<br />나뉜 결과가 여기에 표시됩니다.</p>
            </div>
          ) : (
            <>
              <div className="preview-meta">
                <span>제목 {parsed.sermonTitle || '—'}</span>
                <span>본문 {parsed.scriptureRef || '—'}</span>
                <span>인용 {quoteCount}개</span>
                <span>찬송가 {hymns.numbers.length}장</span>
                <span>찬양 {praises.length}곡</span>
              </div>

              <div className="text-preview-list">
                {parsed.points.map((point) => (
                  <article className="text-preview" key={`${point.number}-${point.title}`}>
                    <span>{point.number}</span>
                    <p>
                      {point.title}
                      {point.quotes.length > 0 && `\n${point.quotes.join(' · ')}`}
                    </p>
                  </article>
                ))}

                {parsed.unresolved.length > 0 && (
                  <article className="text-preview">
                    <span>?</span>
                    <p>{`분류하지 못한 줄\n${parsed.unresolved.join('\n')}`}</p>
                  </article>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <footer className="page-footer">UnoWorship Pro · 헵시바 선교단</footer>
    </main>
  );
}
