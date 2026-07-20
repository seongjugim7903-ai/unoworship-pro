'use client';

// 설교대지 — 정기예배마다 일자·내용·찬양을 저장한다. 주보는 주 1회 별도 저장. (저장 확인 단계)

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { formatWeekLabel, toWeekStart } from '../../lib/weekStart';
import { nextServiceDate } from '../../lib/nextServiceDate';

// 정기예배: 주일낮예배(일 09/11시), 주일오후예배(일 14:30), 수요예배(수 19:30),
// 금요기도회(금 20:30), 월삭감사예배(매월 1일 20:30)
const SERVICE_TYPES = ['주일낮예배', '주일오후예배', '수요예배', '금요기도회', '월삭감사예배'];
const DRAFT_KEY = 'unoworship-pro:sermon-outline-draft:v2';

interface SermonDraft {
  serviceType: string;
  serviceDate: string;
  content: string;
  hymn: string;
  bulletin: string;
}

interface SavedOutline {
  id: string;
  service_date: string | null;
  service_type: string;
  content: string;
  hymn: string;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function outlineTitle(content: string) {
  const titleLine = content.split('\n').find((line) => /^제목\s*[:：]/.test(line));
  if (titleLine) return titleLine.replace(/^제목\s*[:：]\s*/, '').trim();
  return content.slice(0, 20).trim() || '내용 없음';
}

export default function SermonOutlinePage() {
  const [serviceType, setServiceType] = useState('주일낮예배');
  const [serviceDate, setServiceDate] = useState('');
  const [content, setContent] = useState('');
  const [hymn, setHymn] = useState('');
  const [bulletin, setBulletin] = useState('');
  const [draftReady, setDraftReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [bulletinStatus, setBulletinStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [bulletinMessage, setBulletinMessage] = useState('');
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'reading' | 'done' | 'error'>('idle');
  const [ocrMessage, setOcrMessage] = useState('');
  const [recent, setRecent] = useState<SavedOutline[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<SermonDraft>;
        setServiceType(draft.serviceType || '주일낮예배');
        setServiceDate(draft.serviceDate || todayISO());
        setContent(draft.content || '');
        setHymn(draft.hymn || '');
        setBulletin(draft.bulletin || '');
      } else {
        setServiceDate(todayISO());
      }
    } catch (error) {
      console.warn('[sermon-outline] draft load failed', error);
      setServiceDate(todayISO());
    } finally {
      setDraftReady(true);
    }
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    const draft: SermonDraft = { serviceType, serviceDate, content, hymn, bulletin };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [bulletin, content, draftReady, hymn, serviceDate, serviceType]);

  const weekLabel = useMemo(
    () => (serviceDate ? formatWeekLabel(toWeekStart(serviceDate)) : ''),
    [serviceDate],
  );
  const isOutlineValid = content.trim().length > 0;
  const isBulletinValid = bulletin.trim().length > 0 && Boolean(serviceDate);

  const loadRecent = async () => {
    try {
      const response = await fetch('/api/sermon-outlines?limit=10');
      const result = await response.json() as { ok?: boolean; outlines?: SavedOutline[] };
      if (result.ok && Array.isArray(result.outlines)) setRecent(result.outlines);
    } catch (error) {
      console.warn('[sermon-outline] recent load failed', error);
    }
  };

  useEffect(() => {
    void loadRecent();
  }, []);

  const handleSaveOutline = async () => {
    if (!isOutlineValid || saveStatus === 'saving') return;

    setSaveStatus('saving');
    setSaveMessage('설교대지를 저장하고 있습니다...');
    try {
      const response = await fetch('/api/sermon-outlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceType, serviceDate, content: content.trim(), hymn: hymn.trim() }),
      });
      const result = await response.json() as { ok?: boolean; message?: string; outlineId?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.message ?? `저장에 실패했습니다. (HTTP ${response.status})`);
      }

      setSaveStatus('done');
      setSaveMessage(`설교대지 저장 완료 · ${result.outlineId}`);
      void loadRecent();
    } catch (error) {
      console.error('[sermon-outline] save failed', error);
      setSaveStatus('error');
      setSaveMessage(error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.');
    }
  };

  const handleSaveBulletin = async () => {
    if (!isBulletinValid || bulletinStatus === 'saving') return;

    setBulletinStatus('saving');
    setBulletinMessage('주보를 저장하고 있습니다...');
    try {
      const response = await fetch('/api/weekly-bulletins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: serviceDate, content: bulletin.trim() }),
      });
      const result = await response.json() as { ok?: boolean; message?: string; weekStart?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.message ?? `저장에 실패했습니다. (HTTP ${response.status})`);
      }

      setBulletinStatus('done');
      setBulletinMessage(`주보 저장 완료 · ${result.weekStart} 주간`);
    } catch (error) {
      console.error('[weekly-bulletin] save failed', error);
      setBulletinStatus('error');
      setBulletinMessage(error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.');
    }
  };

  const handleServiceTypeChange = (next: string) => {
    setServiceType(next);
    const auto = nextServiceDate(next);
    if (auto) setServiceDate(auto);
  };

  const handleBulletinImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // 같은 파일 재선택 허용
    if (!file) return;

    setOcrStatus('reading');
    setOcrMessage('주보 사진에서 텍스트를 읽고 있습니다... (10~20초)');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const response = await fetch('/api/bulletin-ocr', { method: 'POST', body: formData });
      const result = await response.json() as {
        ok?: boolean;
        message?: string;
        sections?: {
          churchNews: string;
          sundayMorning: string;
          sundayAfternoon: string;
          wednesday: string;
          fridayPrayer: string;
        };
      };

      if (!response.ok || !result.ok || !result.sections) {
        throw new Error(result.message ?? `추출에 실패했습니다. (HTTP ${response.status})`);
      }

      const s = result.sections;
      const blocks = [
        ['교회소식', s.churchNews],
        ['주일낮예배', s.sundayMorning],
        ['주일오후예배', s.sundayAfternoon],
        ['수요예배', s.wednesday],
        ['금요기도회', s.fridayPrayer],
      ]
        .filter(([, body]) => body.trim())
        .map(([title, body]) => `[${title}]\n${body.trim()}`)
        .join('\n\n');

      setBulletin(blocks);
      setOcrStatus('done');
      setOcrMessage('주보 텍스트를 불러왔습니다. 내용을 확인·수정한 뒤 저장하세요.');
    } catch (error) {
      console.error('[bulletin-ocr] failed', error);
      setOcrStatus('error');
      setOcrMessage(error instanceof Error ? error.message : '주보 텍스트 추출 중 오류가 발생했습니다.');
    }
  };

  return (
    <main className="site-shell">
      <header className="site-header">
        <div>
          <h1>헵시바 선교단 설교대지</h1>
        </div>
      </header>

      <div className="content-grid">
        <section className="panel form-panel">
          <div className="panel-heading">
            <div><span className="step-number">01</span><h2>설교대지 (정기예배마다)</h2></div>
            <span className="required-note">* 내용 필수</span>
          </div>

          <div className="field-grid service-fields">
            <label>일자<input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} /></label>
            <label>예배 종류<select value={serviceType} onChange={(event) => handleServiceTypeChange(event.target.value)}>{SERVICE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
          </div>

          <label>내용 *<span className="field-hint">설교대지 원문을 붙여넣으세요.</span>
            <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder={'성경: 사65:17-25\n제목: 새 하늘과 새 땅의 축복\n1. ...'} rows={12} />
          </label>
          <label>찬양<input value={hymn} onChange={(event) => setHymn(event.target.value)} placeholder="예: 236장" /></label>

          <button className="primary-button" onClick={() => void handleSaveOutline()} disabled={!isOutlineValid || saveStatus === 'saving'}>
            {saveStatus === 'saving' ? '저장 중...' : '설교대지 저장'}
          </button>
          {saveMessage && <p className={`field-program-message ${saveStatus}`}>{saveMessage}</p>}

          <div className="bulletin-block">
            <div className="panel-heading">
              <div><span className="step-number">주보</span><h2>주보 (주 1회)</h2></div>
              {weekLabel && <span className="required-note">{weekLabel}</span>}
            </div>
            <label className="bulletin-ocr-row">
              주보 사진에서 불러오기
              <span className="field-hint">교회소식·주일낮/오후예배·수요예배·금요기도회 순서만 뽑아옵니다.</span>
              <input type="file" accept="image/*" onChange={(event) => void handleBulletinImage(event)} disabled={ocrStatus === 'reading'} />
            </label>
            {ocrMessage && <p className={`field-program-message ${ocrStatus === 'reading' ? 'saving' : ocrStatus}`}>{ocrMessage}</p>}
            <label>주보 내용<span className="field-hint">위 일자가 속한 주에 하나만 저장됩니다.</span>
              <textarea value={bulletin} onChange={(event) => setBulletin(event.target.value)} placeholder="주보 내용" rows={8} />
            </label>
            <button className="secondary-button bulletin-save" onClick={() => void handleSaveBulletin()} disabled={!isBulletinValid || bulletinStatus === 'saving'}>
              {bulletinStatus === 'saving' ? '저장 중...' : '주보 저장'}
            </button>
            {bulletinMessage && <p className={`field-program-message ${bulletinStatus}`}>{bulletinMessage}</p>}
          </div>
        </section>

        <section className="panel preview-panel">
          <div className="panel-heading">
            <div><span className="step-number success">02</span><h2>최근 설교대지</h2></div>
            <span className="section-count">{recent.length}건</span>
          </div>
          {recent.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">대지</div><p>저장된 설교대지가<br />여기에 표시됩니다.</p></div>
          ) : (
            <div className="search-result-list">
              {recent.map((item) => (
                <article className="search-result" key={item.id}>
                  <div>
                    <strong>{outlineTitle(item.content)}</strong>
                    <span>
                      {item.service_type} · {item.service_date || '날짜 없음'}
                      {item.hymn ? ` · 찬양 ${item.hymn}` : ''}
                    </span>
                  </div>
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
