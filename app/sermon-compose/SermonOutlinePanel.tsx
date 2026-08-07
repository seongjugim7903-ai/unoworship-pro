'use client';

// 설교대지 원문 저장 — 주보 업로드와 협조문 붙여넣기를 한 화면에서 처리한다.
//
//   주보    → 제목 · 본문 · 설교자 · 찬송가 (협조문에 없는 것)
//   협조문  → 대지타이틀 · 인용구절 (주보에 없는 것)
//
// 둘을 합치면 손으로 채울 것이 거의 없다. 자동 채움은 비어 있는 칸에만 하고,
// 사람이 고친 값은 덮어쓰지 않는다.
//
// 저장하면 현장에서 만들어질 프로그램은 다섯이다.
//   설교대지 · 말씀찾기(본문) · 말씀찾기(인용) · 찬송가 · 찬양(PPT)

import { useMemo, useState } from 'react';
import { defaultSubProgramTitle, parseHymnNumber } from '../../lib/sermon-compose/subProgram';
import { getUpcomingService } from '../../lib/sermon-compose/upcomingService';
import { parseSermonOutline } from '../../lib/sermon-compose/parseSermonOutline';
import { parseServiceOrder, type PreacherSource } from '../../lib/sermon-compose/serviceOrder';
import { BULLETIN_SERVICES, type BulletinOrders } from '../../lib/sermon-compose/bulletinSections';
import ServiceFields, { type ServiceFieldsValue } from './ServiceFields';
import BulletinUploadBlock from './BulletinUploadBlock';

type Status = 'idle' | 'saving' | 'done' | 'error';

interface SavedSubProgram {
  kind: string;
  title: string;
  itemCount: number;
}

const PREACHER_OPTIONS = ['한만상 목사', '김동경 강도사'];
const PREACHER_CUSTOM = '직접기입';

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

  const [sermonTitle, setSermonTitle] = useState('');
  const [scriptureRef, setScriptureRef] = useState('');
  const [preacherSelect, setPreacherSelect] = useState(PREACHER_OPTIONS[0]);
  const [customPreacher, setCustomPreacher] = useState('');
  /* 설교자를 주보 어디서 얻었는지 — 축도에서 끌어온 추정값이면 확인을 요청한다. */
  const [preacherSource, setPreacherSource] = useState<PreacherSource>('');
  const [content, setContent] = useState('');
  const [hymnText, setHymnText] = useState('');
  const [praiseText, setPraiseText] = useState('');
  const [orderText, setOrderText] = useState('');
  /* 주보 분석 결과 전체 — 예배 종류를 바꾸면 그 예배 순서로 다시 채워야 해서 들고 있는다. */
  const [bulletinOrders, setBulletinOrders] = useState<BulletinOrders | null>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState<SavedSubProgram[]>([]);

  const hymns = useMemo(() => readHymnNumbers(hymnText), [hymnText]);
  const praises = useMemo(() => readPraiseSongs(praiseText), [praiseText]);
  const parsed = useMemo(() => parseSermonOutline(content), [content]);

  const preacher = preacherSelect === PREACHER_CUSTOM ? customPreacher.trim() : preacherSelect;
  const hymnTitle = defaultSubProgramTitle(fields.serviceDate, fields.serviceType, 'hymn');
  const praiseTitle = defaultSubProgramTitle(fields.serviceDate, fields.serviceType, 'praise');
  const busy = status === 'saving';
  const quoteCount = parsed.points.reduce((sum, point) => sum + point.quotes.length, 0);

  /** 협조문·주보 어느 쪽이 먼저 오든, 비어 있는 칸만 채운다. 사람이 고친 값은 건드리지 않는다. */
  const fillIfEmpty = (setter: (value: string) => void, current: string, incoming: string) => {
    if (!current.trim() && incoming.trim()) setter(incoming.trim());
  };

  const handleContentChange = (next: string) => {
    setContent(next);
    const outline = parseSermonOutline(next);
    fillIfEmpty(setSermonTitle, sermonTitle, outline.sermonTitle);
    fillIfEmpty(setScriptureRef, scriptureRef, outline.scriptureRef);
    /* 협조문에 '설교자:' 줄이 있을 때만 반영한다. 없으면 기본값(한만상 목사)이 그대로 남고,
       사람이 이미 다른 설교자를 고른 상태면 건드리지 않는다. */
    if (outline.preacher && preacherSelect === PREACHER_OPTIONS[0] && !customPreacher) {
      if (PREACHER_OPTIONS.includes(outline.preacher)) {
        setPreacherSelect(outline.preacher);
        setCustomPreacher('');
      } else {
        setPreacherSelect(PREACHER_CUSTOM);
        setCustomPreacher(outline.preacher);
      }
    }
    /* 협조문에도 '찬양:' 줄이 있으면 받아 둔다 — 주보와 겹치면 먼저 채워진 쪽이 남는다. */
    fillIfEmpty(setHymnText, hymnText, outline.hymnNumbers.map((n) => `${n}장`).join(', '));
    fillIfEmpty(setPraiseText, praiseText, outline.praiseSongs.join('\n'));
  };

  /**
   * 주보에서 뽑은 특정 예배 순서를 각 칸에 넣는다.
   *   fill      — 비어 있는 칸만 채운다 (분석 직후. 사람이 미리 적어 둔 값을 지우지 않는다)
   *   overwrite — 주보가 준 값으로 덮어쓴다 (예배 종류를 바꿨을 때.
   *               다른 예배를 고른 것은 "이 예배 기준으로 다시" 라는 뜻이다)
   */
  const applyOrderFor = (
    serviceType: string,
    orders: BulletinOrders,
    mode: 'fill' | 'overwrite',
  ) => {
    const key = BULLETIN_SERVICES.find((s) => s.serviceType === serviceType)?.key;
    const raw = key ? orders[key] : '';
    setOrderText(raw);
    if (!raw.trim()) return;

    const order = parseServiceOrder(raw);
    /* 예배를 바꾼 경우(overwrite)에는 이전 예배 값이 남으면 안 된다.
       주보에 없으면 협조문에서, 그것도 없으면 비운다. */
    const outline = parseSermonOutline(content);
    const put = (
      setter: (v: string) => void,
      current: string,
      incoming: string,
      fallback = '',
    ) => {
      if (mode === 'overwrite') setter(incoming.trim() || fallback.trim());
      else fillIfEmpty(setter, current, incoming);
    };

    put(setSermonTitle, sermonTitle, order.sermonTitle, outline.sermonTitle);
    put(setScriptureRef, scriptureRef, order.scriptureRef, outline.scriptureRef);
    put(setHymnText, hymnText, order.hymnNumbers.map((n) => `${n}장`).join(', '),
      outline.hymnNumbers.map((n) => `${n}장`).join(', '));
    put(setPraiseText, praiseText, order.praiseSongs.join('\n'), outline.praiseSongs.join('\n'));

    /* 설교자는 선택지에 있으면 고르고, 없으면 직접기입으로 넘긴다. */
    const untouched = preacherSelect === PREACHER_OPTIONS[0] && !customPreacher;
    if (order.preacher && (mode === 'overwrite' || untouched)) {
      if (PREACHER_OPTIONS.includes(order.preacher)) {
        setPreacherSelect(order.preacher);
        setCustomPreacher('');
      } else {
        setPreacherSelect(PREACHER_CUSTOM);
        setCustomPreacher(order.preacher);
      }
    } else if (mode === 'overwrite') {
      /* 바꾼 예배의 순서에 설교자가 없으면 이전 예배 설교자를 지우고 기본값으로 되돌린다. */
      setPreacherSelect(PREACHER_OPTIONS[0]);
      setCustomPreacher('');
    }
    setPreacherSource(order.preacherSource);
  };

  /* 새로 분석했든 이번 주 주보를 되살렸든, 사람이 적어 둔 값은 지우지 않는다. */
  const handleBulletinOrders = (orders: BulletinOrders) => {
    setBulletinOrders(orders);
    applyOrderFor(fields.serviceType, orders, 'fill');
  };

  /** 예배 종류를 바꾸면 주보에서 그 예배 순서를 다시 꺼내 채운다. */
  const handleFieldsChange = (next: ServiceFieldsValue) => {
    const serviceChanged = next.serviceType !== fields.serviceType;
    setFields(next);
    if (serviceChanged && bulletinOrders) {
      applyOrderFor(next.serviceType, bulletinOrders, 'overwrite');
    }
  };

  /* 순서표를 손으로 고치면 아래 칸이 바로 따라온다 — 따로 누를 버튼이 없다.
     읽기는 됐는데 항목 이름이 달라 못 알아본 경우를 그 자리에서 바로잡는 통로다. */
  const handleOrderTextChange = (next: string) => {
    setOrderText(next);
    if (!next.trim()) return;

    const order = parseServiceOrder(next);
    if (order.sermonTitle) setSermonTitle(order.sermonTitle);
    if (order.scriptureRef) setScriptureRef(order.scriptureRef);
    if (order.hymnNumbers.length > 0) setHymnText(order.hymnNumbers.map((n) => `${n}장`).join(', '));
    if (order.praiseSongs.length > 0) setPraiseText(order.praiseSongs.join('\n'));
    if (order.preacher) {
      if (PREACHER_OPTIONS.includes(order.preacher)) {
        setPreacherSelect(order.preacher);
        setCustomPreacher('');
      } else {
        setPreacherSelect(PREACHER_CUSTOM);
        setCustomPreacher(order.preacher);
      }
    }
    setPreacherSource(order.preacherSource);
  };

  /* 순서표는 읽었는데 항목을 하나도 못 알아본 경우 — 사람이 볼 수 있게 알린다. */
  const orderParsed = useMemo(
    () => (orderText.trim() ? parseServiceOrder(orderText) : null),
    [orderText],
  );
  const orderUnread = Boolean(
    orderParsed &&
      !orderParsed.scriptureRef &&
      !orderParsed.sermonTitle &&
      orderParsed.hymnNumbers.length === 0,
  );

  /** 저장하면 현장에서 만들어질 프로그램 — 조건을 갖춘 것만 보여 준다 */
  const plannedPrograms = [
    { name: '설교대지', ready: Boolean(sermonTitle.trim() && scriptureRef.trim()), note: '제목 · 본문 · 설교자' },
    { name: '말씀찾기(본문)', ready: Boolean(scriptureRef.trim()), note: '본문 장 전체' },
    { name: '말씀찾기(인용)', ready: parsed.points.length > 0, note: `대지 ${parsed.points.length}개 · 인용 ${quoteCount}개` },
    { name: '찬송가', ready: hymns.numbers.length > 0, note: hymns.numbers.map((n) => `${n}장`).join(', ') || '장 번호 없음' },
    { name: '찬양(PPT)', ready: praises.length > 0, note: praises.join(', ') || '곡명 없음' },
  ];

  const canSave = Boolean(content.trim() || scriptureRef.trim()) && !busy;

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
          sermonTitle: sermonTitle.trim(),
          scriptureRef: scriptureRef.trim(),
          preacher,
          serviceOrder: orderText,
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
            <span className="required-note">* 본문 또는 협조문 필요</span>
          </div>

          <ServiceFields
            value={fields}
            onChange={handleFieldsChange}
            autoTitle={`${hymnTitle} · ${praiseTitle}`}
            detectedServiceType={upcoming.serviceType}
            showTitle={false}
            disabled={busy}
          />

          <BulletinUploadBlock
            serviceType={fields.serviceType}
            serviceDate={fields.serviceDate}
            onOrders={handleBulletinOrders}
            disabled={busy}
          />

          {bulletinOrders && (
            <label>
              주보에서 읽은 {fields.serviceType} 순서
              <span className="field-hint">
                {orderText.trim()
                  ? '여기를 고치면 아래 칸이 바로 따라옵니다.'
                  : `주보에서 ${fields.serviceType} 순서를 찾지 못했습니다. 직접 적으면 아래 칸이 채워집니다.`}
              </span>
              <textarea
                value={orderText}
                onChange={(event) => handleOrderTextChange(event.target.value)}
                placeholder={'성경봉독: 요14:1-3\n말씀선포: 마음에 근심하지 말라!\n찬송: 310장'}
                rows={orderText.trim() ? 7 : 3}
                disabled={busy}
              />
            </label>
          )}
          {bulletinOrders && orderUnread && (
            <p className="info-message">
              순서는 읽었지만 <b>성경봉독 · 말씀선포 · 찬송</b> 항목을 알아보지 못했습니다.
              위 내용을 <span style={{ fontFamily: 'ui-monospace, monospace' }}>항목: 내용</span> 형태로
              고치면 아래 칸이 바로 채워집니다.
            </p>
          )}

          <div className="song-inline">
            <label>
              설교제목
              <input value={sermonTitle} onChange={(e) => setSermonTitle(e.target.value)} placeholder="예: 마음에 근심하지 말라!" disabled={busy} />
            </label>
            <label>
              본문 (요절)
              <input value={scriptureRef} onChange={(e) => setScriptureRef(e.target.value)} placeholder="예: 요14:1-3" disabled={busy} />
            </label>
          </div>

          <label>
            설교자
            <select
              value={preacherSelect}
              onChange={(e) => {
                setPreacherSelect(e.target.value);
                if (e.target.value !== PREACHER_CUSTOM) setCustomPreacher('');
              }}
              disabled={busy}
            >
              {PREACHER_OPTIONS.map((p) => <option key={p}>{p}</option>)}
              <option value={PREACHER_CUSTOM}>{PREACHER_CUSTOM}</option>
            </select>
          </label>
          {preacherSelect === PREACHER_CUSTOM && (
            <label>
              설교자 이름
              <input value={customPreacher} onChange={(e) => setCustomPreacher(e.target.value)} placeholder="이름을 직접 입력" disabled={busy} />
            </label>
          )}
          {preacherSource === 'benediction' && (
            <p className="info-message">
              주보에 설교자 항목이 없어 <b>축도 담당자</b>에서 끌어왔습니다. 축도는 담임목사가 맡는 경우가 많으니
              그날 설교자가 맞는지 확인해 주세요.
            </p>
          )}

          <label>
            협조문 (대지 · 인용구절)
            <span className="field-hint">주보에 없는 대지타이틀과 인용구절이 여기서 나옵니다.</span>
            <textarea
              value={content}
              onChange={(event) => handleContentChange(event.target.value)}
              placeholder={PLACEHOLDER}
              rows={10}
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
              <p className="setlist-preview-label">함께 저장된 프로그램</p>
              <ol>
                {saved.map((program) => (
                  <li key={program.title}>
                    <span>{program.itemCount}</span>
                    <p>{program.title}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        <section className="panel preview-panel">
          <div className="panel-heading">
            <div><span className="step-number success">02</span><h2>만들어질 프로그램</h2></div>
            <span className="section-count">{plannedPrograms.filter((p) => p.ready).length}/5</span>
          </div>

          <div className="setlist-preview" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
            <ol>
              {plannedPrograms.map((program, index) => (
                <li key={program.name} style={{ opacity: program.ready ? 1 : 0.45 }}>
                  <span style={{ background: program.ready ? undefined : '#b6bfd0' }}>{index + 1}</span>
                  <p>
                    {program.name}
                    <span style={{ display: 'block', marginTop: 2, fontSize: 11, fontWeight: 400, color: '#8a96a9' }}>
                      {program.ready ? program.note : '아직 입력이 없습니다'}
                    </span>
                  </p>
                </li>
              ))}
            </ol>
          </div>

          {parsed.points.length > 0 && (
            <>
              <div className="preview-meta" style={{ marginTop: 18 }}>
                <span>제목 {sermonTitle || '—'}</span>
                <span>본문 {scriptureRef || '—'}</span>
                <span>설교자 {preacher || '—'}</span>
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
