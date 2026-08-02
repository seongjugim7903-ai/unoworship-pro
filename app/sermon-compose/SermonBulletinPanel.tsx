'use client';

// 주보 파일 업로드 — 올리면 바로 읽어서 예배 순서 세 가지(주일낮·주일오후·수요)만 뽑는다.
// 교회소식과 금요기도회는 뽑지 않는다(교회소식은 자체 탭에서 직접 입력받는다).
//
// 뽑은 순서는 다음 단계에서 설교대지·찬송가·찬양 프로그램으로 나뉜다.
// 지금은 어느 순서가 어디로 갈지 화면에 적어 두기만 한다.

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { compressImage } from '../../lib/sermon-compose/compressImage';
import {
  BULLETIN_SERVICES,
  countOrderLines,
  emptyBulletinOrders,
  hasAnyBulletinOrder,
  mergeBulletinOrders,
  type BulletinOrders,
  type BulletinServiceKey,
} from '../../lib/sermon-compose/bulletinSections';
import { getUpcomingService } from '../../lib/sermon-compose/upcomingService';
import { formatWeekLabel, toWeekStart } from '../../lib/weekStart';

interface PickedPage {
  key: string;
  name: string;
  blob: Blob;
  previewUrl: string;
}

type Status = 'idle' | 'reading' | 'analyzing' | 'saving' | 'done' | 'error';

/** 주보 면 수 상한 — 실수로 앨범 전체를 고르는 사고를 막는다 */
const MAX_PAGES = 6;

export default function SermonBulletinPanel() {
  const upcoming = useMemo(() => getUpcomingService(), []);
  const [date, setDate] = useState(upcoming.serviceDate);
  const [pages, setPages] = useState<PickedPage[]>([]);
  const [orders, setOrders] = useState<BulletinOrders>(emptyBulletinOrders);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  /* 분석 중 최신 순서를 읽어야 해서 상태와 같은 값을 ref 로도 들고 간다.
     (setState 업데이터 안에서 병합 결과를 밖으로 빼내는 편법을 쓰지 않으려는 것) */
  const ordersRef = useRef<BulletinOrders>(emptyBulletinOrders());
  const applyOrders = (next: BulletinOrders) => {
    ordersRef.current = next;
    setOrders(next);
  };

  /* 미리보기 object URL 은 컴포넌트가 사라질 때 반드시 해제한다. */
  const liveUrls = useRef<Set<string>>(new Set());
  useEffect(() => {
    const urls = liveUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const weekLabel = formatWeekLabel(toWeekStart(date));
  const busy = status === 'reading' || status === 'analyzing' || status === 'saving';
  const canSave = hasAnyBulletinOrder(orders) && !busy;
  const filledCount = BULLETIN_SERVICES.filter(({ key }) => orders[key].trim()).length;

  /**
   * 면마다 따로 읽고 같은 예배끼리 이어 붙인다 — 한 순서가 두 면에 걸쳐도 잃지 않는다.
   *   append  — 새로 올린 면만 읽어 기존 결과 뒤에 잇는다 (업로드 직후 자동 실행)
   *   replace — 올린 면 전체를 다시 읽어 결과를 새로 만든다 (편집한 내용은 버려진다)
   */
  const analyzePages = async (targets: PickedPage[], mode: 'append' | 'replace') => {
    if (targets.length === 0) return;

    setStatus('analyzing');
    setMessage(`주보 ${targets.length}면을 읽고 있습니다... (면당 10~20초)`);
    try {
      const results: Partial<BulletinOrders>[] = [];
      const failedPages: string[] = [];

      for (const [index, page] of targets.entries()) {
        const formData = new FormData();
        formData.append('image', page.blob, `${index + 1}.webp`);
        const response = await fetch('/api/sermon-compose/bulletin-ocr', {
          method: 'POST',
          body: formData,
        });
        const result = (await response.json()) as {
          ok?: boolean; message?: string; orders?: BulletinOrders;
        };

        if (!response.ok || !result.ok || !result.orders) {
          /* 첫 면부터 설정 문제로 막히면 나머지도 같은 이유라 바로 알린다. */
          if (index === 0) {
            throw new Error(result.message ?? `분석에 실패했습니다. (HTTP ${response.status})`);
          }
          failedPages.push(page.name);
          continue;
        }
        results.push(result.orders);
      }

      const base = mode === 'append' ? [ordersRef.current] : [];
      const merged = mergeBulletinOrders([...base, ...results]);
      applyOrders(merged);

      const found = hasAnyBulletinOrder(merged);
      setStatus(found ? 'done' : 'error');
      setMessage(
        found
          ? [
              `${results.length}면 분석 완료`,
              failedPages.length > 0 ? `읽지 못한 파일: ${failedPages.join(', ')}` : '',
              '내용을 확인·수정한 뒤 저장하세요.',
            ]
              .filter(Boolean)
              .join(' · ')
          : '주보에서 예배 순서를 찾지 못했습니다. 순서표가 보이는 면을 올려 주세요.',
      );
    } catch (error) {
      console.error('[sermon-compose-bulletin] analyze failed', error);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '주보 분석 중 오류가 발생했습니다.');
    }
  };

  /** 파일을 고르면 압축한 뒤 곧바로 분석까지 이어 간다 — 따로 버튼을 누르지 않아도 된다. */
  const handlePick = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = ''; // 같은 파일 재선택 허용
    if (files.length === 0) return;

    const room = MAX_PAGES - pages.length;
    if (room <= 0) {
      setStatus('error');
      setMessage(`주보는 ${MAX_PAGES}면까지 올릴 수 있습니다.`);
      return;
    }

    setStatus('reading');
    setMessage(`주보 ${Math.min(files.length, room)}면을 준비하고 있습니다...`);

    const picked: PickedPage[] = [];
    const failed: string[] = [];

    for (const file of files.slice(0, room)) {
      try {
        const compressed = await compressImage(file);
        liveUrls.current.add(compressed.previewUrl);
        picked.push({
          key: `${file.name}-${file.lastModified}-${picked.length}`,
          name: file.name,
          blob: compressed.blob,
          previewUrl: compressed.previewUrl,
        });
      } catch {
        failed.push(file.name);
      }
    }

    setPages((prev) => [...prev, ...picked]);

    if (picked.length === 0) {
      setStatus('error');
      setMessage(`열지 못한 파일: ${failed.join(', ')}`);
      return;
    }

    await analyzePages(picked, 'append');
  };

  const removePage = (key: string) => {
    setPages((prev) => {
      const target = prev.find((page) => page.key === key);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        liveUrls.current.delete(target.previewUrl);
      }
      return prev.filter((page) => page.key !== key);
    });
  };

  const handleSave = async () => {
    if (!canSave) return;

    setStatus('saving');
    setMessage('주보를 저장하고 있습니다...');
    try {
      const response = await fetch('/api/sermon-compose/bulletin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, orders }),
      });
      const result = (await response.json()) as { ok?: boolean; message?: string; weekStart?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.message ?? `저장에 실패했습니다. (HTTP ${response.status})`);
      }

      setStatus('done');
      setMessage(`주보 저장 완료 · ${result.weekStart} 주간`);
    } catch (error) {
      console.error('[sermon-compose-bulletin] save failed', error);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.');
    }
  };

  const setOrder = (key: BulletinServiceKey, value: string) => {
    applyOrders({ ...ordersRef.current, [key]: value });
  };

  return (
    <main className="site-shell">
      <div className="content-grid">
        <section className="panel form-panel">
          <div className="panel-heading">
            <div><span className="step-number">01</span><h2>주보 파일</h2></div>
            <span className="required-note">{weekLabel}</span>
          </div>

          <div className="field-grid service-fields">
            <label>
              주보 주간
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={busy} />
            </label>
          </div>
          <p className="field-program-message">
            어떤 날짜를 넣어도 그 주 일요일 기준 한 건으로 저장됩니다. 같은 주에 다시 저장하면 덮어씁니다.
          </p>

          <label className="sheet-field">
            주보 이미지
            <span className="field-hint">
              고르면 바로 읽습니다. 앞뒤 여러 면을 한 번에 올릴 수 있습니다({MAX_PAGES}면까지).
              긴 변 1920px WebP 로 줄여서 보냅니다.
            </span>
            <input type="file" accept="image/*" multiple onChange={(event) => void handlePick(event)} disabled={busy} />
          </label>

          {pages.length > 0 && (
            <div className="image-grid" style={{ marginTop: 12 }}>
              {/* figure 기본 좌우 여백(40px)이 그리드 칸을 먹어 카드가 쪼그라든다 — style 로 지운다 */}
              {pages.map((page, index) => (
                <figure className="image-card" key={page.key} style={{ margin: 0 }}>
                  {/* 로컬 blob 미리보기라 next/image 최적화 대상이 아니다 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={page.previewUrl} alt={`주보 ${index + 1}면`} />
                  <figcaption className="image-card-footer">
                    <span
                      title={page.name}
                      style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {index + 1}면
                    </span>
                    <div style={{ flexShrink: 0 }}>
                      <button
                        className="text-button danger"
                        type="button"
                        onClick={() => removePage(page.key)}
                        disabled={busy}
                        aria-label={`${index + 1}면 삭제`}
                      >
                        삭제
                      </button>
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          <button
            className="primary-button"
            onClick={() => void handleSave()}
            disabled={!canSave}
            style={{ marginTop: 12 }}
          >
            {status === 'saving' ? '저장 중...' : `주보 저장${filledCount > 0 ? ` (예배 ${filledCount}개)` : ''}`}
          </button>

          {pages.length > 0 && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => void analyzePages(pages, 'replace')}
              disabled={busy}
              style={{ width: '100%', marginTop: 8 }}
            >
              {status === 'analyzing' ? '읽는 중...' : `전체 다시 분석 (${pages.length}면)`}
            </button>
          )}
          {pages.length > 0 && (
            <p className="field-hint">다시 분석하면 아래에서 고친 내용은 사라지고 새로 읽은 결과로 바뀝니다.</p>
          )}

          {message && (
            <p
              className={`field-program-message ${
                status === 'reading' || status === 'analyzing' ? 'saving' : status
              }`}
            >
              {message}
            </p>
          )}
        </section>

        <section className="panel preview-panel">
          <div className="panel-heading">
            <div><span className="step-number success">02</span><h2>예배 순서</h2></div>
            <span className="section-count">{filledCount}/{BULLETIN_SERVICES.length}</span>
          </div>

          {!hasAnyBulletinOrder(orders) ? (
            <div className="empty-state">
              <div className="empty-icon">주보</div>
              <p>주보를 올리면 곧바로 읽어서<br />주일낮 · 주일오후 · 수요예배 순서를<br />여기에 나눠 보여 줍니다.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {BULLETIN_SERVICES.map(({ key, serviceType, destination }) => {
                const value = orders[key];
                const lineCount = countOrderLines(value);
                return (
                  <label key={key}>
                    {serviceType}
                    <span className="field-hint">
                      {destination}
                      {value.trim() ? ` · ${lineCount}줄` : ' · 찾지 못함'}
                    </span>
                    <textarea
                      value={value}
                      onChange={(event) => setOrder(key, event.target.value)}
                      placeholder={`${serviceType} 순서를 찾지 못했습니다. 직접 적어도 됩니다.`}
                      rows={value.trim() ? 8 : 2}
                      disabled={busy}
                    />
                  </label>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <footer className="page-footer">UnoWorship Pro · 헵시바 선교단</footer>
    </main>
  );
}
