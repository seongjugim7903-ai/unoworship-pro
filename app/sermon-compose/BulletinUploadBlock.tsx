'use client';

// 주보 업로드 + 자동 분석 블록. 원문 저장 화면 안에 얹혀서 쓴다.
// 고른 즉시 읽어 예배 순서 세 가지를 뽑고, 선택된 예배의 순서를 부모에게 넘긴다.
// 주보에는 협조문에 없는 것(찬송가·설교자)이 있어서 둘을 합치면 손으로 채울 것이 거의 없다.

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { compressImage } from '../../lib/sermon-compose/compressImage';
import {
  BULLETIN_SERVICES,
  emptyBulletinOrders,
  hasAnyBulletinOrder,
  mergeBulletinOrders,
  type BulletinOrders,
} from '../../lib/sermon-compose/bulletinSections';
import {
  clearBulletinCache,
  loadBulletinCache,
  saveBulletinCache,
} from '../../lib/sermon-compose/bulletinCache';

interface PickedPage {
  key: string;
  name: string;
  blob: Blob;
  previewUrl: string;
}

type Phase = 'idle' | 'reading' | 'analyzing' | 'done' | 'error';

/** 주보 면 수 상한 — 실수로 앨범 전체를 고르는 사고를 막는다 */
const MAX_PAGES = 6;

interface Props {
  /** 지금 고른 정기예배 — 이 예배의 순서를 찾았는지 안내할 때 쓴다 */
  serviceType: string;
  /** 주보 주간을 정할 날짜 — 같은 주에 올린 주보만 다시 쓴다 */
  serviceDate: string;
  /** 분석이 끝나거나 저장해 둔 주보를 되살렸을 때 전체 순서를 넘긴다 */
  onOrders: (orders: BulletinOrders, source: 'analyzed' | 'restored') => void;
  disabled?: boolean;
}

export default function BulletinUploadBlock({ serviceType, serviceDate, onOrders, disabled }: Props) {
  const [pages, setPages] = useState<PickedPage[]>([]);
  const [orders, setOrders] = useState<BulletinOrders>(emptyBulletinOrders);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [restoredAt, setRestoredAt] = useState<number | null>(null);

  /* 분석 중 직전 결과를 읽어야 해서 상태와 같은 값을 ref 로도 들고 간다. */
  const ordersRef = useRef<BulletinOrders>(emptyBulletinOrders());
  const applyOrders = (next: BulletinOrders, source: 'analyzed' | 'restored') => {
    ordersRef.current = next;
    setOrders(next);
    onOrders(next, source);
  };

  /* 같은 주에 이미 올려 둔 주보가 있으면 되살린다.
     주일 오후가 끝나 도래 예배가 수요예배로 넘어가도 다시 올릴 필요가 없다. */
  const restoredOnce = useRef(false);
  useEffect(() => {
    if (restoredOnce.current || !serviceDate) return;
    const cached = loadBulletinCache(serviceDate);
    if (!cached || !hasAnyBulletinOrder(cached.orders)) return;

    restoredOnce.current = true;
    applyOrders(cached.orders, 'restored');
    setRestoredAt(cached.savedAt);
    setPhase('done');
    setMessage('이번 주에 올려 둔 주보를 다시 썼습니다. 새로 올리면 이 내용을 대신합니다.');
    // applyOrders 는 매 렌더 새로 만들어지지만 실행은 restoredOnce 로 한 번만 막는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceDate]);

  /* 미리보기 object URL 은 컴포넌트가 사라질 때 반드시 해제한다. */
  const liveUrls = useRef<Set<string>>(new Set());
  useEffect(() => {
    const urls = liveUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const busy = phase === 'reading' || phase === 'analyzing';
  const blocked = busy || Boolean(disabled);

  /**
   * 면마다 따로 읽고 같은 예배끼리 이어 붙인다 — 한 순서가 두 면에 걸쳐도 잃지 않는다.
   *   append  — 새로 올린 면만 읽어 기존 결과 뒤에 잇는다 (업로드 직후 자동)
   *   replace — 올린 면 전체를 다시 읽어 결과를 새로 만든다
   */
  const analyzePages = async (targets: PickedPage[], mode: 'append' | 'replace') => {
    if (targets.length === 0) return;

    setPhase('analyzing');
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
      applyOrders(merged, 'analyzed');

      const found = hasAnyBulletinOrder(merged);
      /* 이번 주 안에서는 다시 올리지 않아도 되도록 남겨 둔다. */
      if (found) {
        saveBulletinCache(serviceDate, merged);
        setRestoredAt(null);
      }
      setPhase(found ? 'done' : 'error');
      setMessage(
        found
          ? [
              `${results.length}면 분석 완료`,
              failedPages.length > 0 ? `읽지 못한 파일: ${failedPages.join(', ')}` : '',
              '아래 항목이 자동으로 채워졌습니다.',
            ]
              .filter(Boolean)
              .join(' · ')
          : '주보에서 예배 순서를 찾지 못했습니다. 순서표가 보이는 면을 올려 주세요.',
      );
    } catch (error) {
      console.error('[bulletin-upload] analyze failed', error);
      setPhase('error');
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
      setPhase('error');
      setMessage(`주보는 ${MAX_PAGES}면까지 올릴 수 있습니다.`);
      return;
    }

    setPhase('reading');
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
      setPhase('error');
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

  /** 지금 고른 예배의 순서를 찾았는지 — 못 찾았으면 그 사실을 알려 준다 */
  const currentKey = BULLETIN_SERVICES.find((service) => service.serviceType === serviceType)?.key;
  const currentOrder = currentKey ? orders[currentKey] : '';
  const foundServices = BULLETIN_SERVICES.filter(({ key }) => orders[key].trim());

  /* fieldset 은 UA 기본 min-inline-size:min-content 라 부모 안에서 쪼그라든다 — div 를 쓴다. */
  return (
    <div style={{ margin: '0 0 4px' }}>
      <label className="sheet-field">
        주보에서 불러오기
        <span className="field-hint">
          고르면 바로 읽어서 제목·본문·설교자·찬송가를 채웁니다. 앞뒤 여러 면을 한 번에 올려도 됩니다({MAX_PAGES}면까지).
        </span>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => void handlePick(event)}
          disabled={blocked}
        />
      </label>

      {pages.length > 0 && (
        <div className="image-grid" style={{ marginTop: 10 }}>
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
                    disabled={blocked}
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

      {pages.length > 0 && (
        <button
          className="secondary-button"
          type="button"
          onClick={() => void analyzePages(pages, 'replace')}
          disabled={blocked}
          style={{ width: '100%', marginTop: 8 }}
        >
          {phase === 'analyzing' ? '읽는 중...' : `전체 다시 분석 (${pages.length}면)`}
        </button>
      )}

      {message && (
        <p className={`field-program-message ${busy ? 'saving' : phase}`}>{message}</p>
      )}

      {foundServices.length > 0 && (
        <>
          <p className="field-hint">
            주보에서 찾은 예배 — {foundServices.map(({ serviceType: name }) => name).join(' · ')}
            {currentKey && !currentOrder.trim() && ` (지금 고른 ${serviceType} 순서는 찾지 못했습니다)`}
          </p>
          {restoredAt !== null && pages.length === 0 && (
            <button
              className="text-button"
              type="button"
              onClick={() => {
                clearBulletinCache();
                applyOrders(emptyBulletinOrders(), 'analyzed');
                setRestoredAt(null);
                setPhase('idle');
                setMessage('저장해 둔 주보를 지웠습니다. 새로 올려 주세요.');
              }}
              disabled={blocked}
            >
              저장해 둔 주보 지우기
            </button>
          )}
        </>
      )}
    </div>
  );
}
