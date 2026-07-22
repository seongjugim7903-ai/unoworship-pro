'use client';

/**
 * ChoirSubtitleForm — 찬양대 자막 요청 작성/수정 폼
 *
 * /media/fellowship 페이지에서 렌더링.
 * 작성 완료 시 UnoLive 셋리스트에 자동 등록 + 서버 JSON 저장.
 *
 * 수정 모드:
 *   - URL ?edit=<programId> → 서버에서 기존 데이터 불러와 폼에 복원
 *   - 제출 시 PUT 으로 업데이트
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import CopyrightComplianceNotice from '@/components/compliance/CopyrightComplianceNotice';
import { submitChoirSubtitle, type ChoirSubtitleForm as FormData } from '@/lib/generators/choirSubtitleGenerator';
import type { SavedProgram } from '@/lib/generators/programTypes';
import type { SetlistItem } from '@/lib/types';
import ChoirPromptImageGallery from '@/components/prompt/choir/ChoirPromptImageGallery';
import {
  WORSHIP_OTHER_VALUE,
  WORSHIP_SELECT_OPTIONS,
  formatYYYYMMDD,
  getNextRegularWorshipDate,
  getWorshipSelectValue,
} from '@/lib/media/worshipDefaults';

function formatDisplay(d: Date): string {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. (${days[d.getDay()]})`;
}

/** YYYYMMDD → YYYY-MM-DD */
function toISODate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

export default function ChoirSubtitleForm() {
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit') || null;

  const [worshipType, setWorshipType] = useState('수요예배');
  const [customWorshipName, setCustomWorshipName] = useState('');
  const [customDate, setCustomDate] = useState<string>('');
  const [songTitle, setSongTitle] = useState('');
  const [composer, setComposer] = useState('');
  const [arranger, setArranger] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(!!editId);
  const [submitted, setSubmitted] = useState<{
    worshipName: string;
    songTitle: string;
    sectionCount: number;
    programId: string;
    item: SetlistItem;
  } | null>(null);

  // ── 수정 모드: 서버에서 기존 데이터 불러오기 ──
  const loadExisting = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/programs/${id}`);
      if (!res.ok) throw new Error('Not found');
      const { program }: { program: SavedProgram } = await res.json();
      const form = program.formData as unknown as FormData;

      const selectValue = getWorshipSelectValue(form.worshipType);
      setWorshipType(selectValue);
      setCustomWorshipName(selectValue === WORSHIP_OTHER_VALUE ? form.worshipType : '');
      setCustomDate(form.worshipDate ? toISODate(form.worshipDate) : '');
      setSongTitle(form.songTitle);
      setComposer(form.composer);
      setArranger(form.arranger);
      setLyrics(form.lyrics);
      setNote(form.note);
    } catch (err) {
      console.error('프로그램 불러오기 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (editId) loadExisting(editId);
  }, [editId, loadExisting]);

  // 날짜 자동 계산
  const actualWorshipType = worshipType === WORSHIP_OTHER_VALUE
    ? customWorshipName.trim()
    : worshipType;
  const autoDate = useMemo(() => getNextRegularWorshipDate(worshipType), [worshipType]);
  const worshipDate = customDate
    ? customDate.replace(/-/g, '')
    : formatYYYYMMDD(autoDate);
  const worshipDisplayDate = customDate
    ? formatDisplay(new Date(customDate))
    : formatDisplay(autoDate);
  const worshipId = `${worshipDate}-${actualWorshipType || WORSHIP_OTHER_VALUE}`;

  // 가사 섹션 미리보기
  const previewSections = useMemo(() => {
    if (!lyrics.trim()) return [];
    return lyrics
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter((b) => b.length > 0);
  }, [lyrics]);

  const isValid = actualWorshipType && songTitle.trim() && composer.trim() && lyrics.trim();

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);

    try {
      const form: FormData = {
        worshipType: actualWorshipType,
        worshipDate,
        songTitle: songTitle.trim(),
        composer: composer.trim(),
        arranger: arranger.trim(),
        lyrics: lyrics.trim(),
        note: note.trim(),
      };

      const result = await submitChoirSubtitle(form, editId || undefined);

      setSubmitted({
        worshipName: worshipId,
        songTitle: form.songTitle,
        sectionCount: result.sectionCount,
        programId: result.itemId,
        item: result.item,
      });
    } catch (err) {
      console.error('제출 실패:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSongTitle('');
    setComposer('');
    setArranger('');
    setLyrics('');
    setNote('');
    setSubmitted(null);
  };

  // ── 로딩 상태 ──
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
          <div className="animate-spin w-8 h-8 border-3 border-violet-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm text-gray-500">프로그램 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // ── 완료 상태 ──
  if (submitted) {
    const shareUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/share/choir/${submitted.programId}`
        : '';
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {editId ? '자막 수정 완료' : '자막 요청 완료'}
          </h2>
          <p className="text-sm text-gray-600 mb-1">
            <span className="font-semibold text-emerald-700">{submitted.worshipName}</span>
          </p>
          <p className="text-sm text-gray-600 mb-4">
            <span className="font-semibold">{submitted.songTitle}</span> — {submitted.sectionCount}개 섹션 등록됨
          </p>
          <p className="text-xs text-gray-400 mb-6">
            UnoLive 에디터 좌측 패널에서 해당 워쉽을 확인할 수 있습니다.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleReset}
              className="px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
            >
              다른 곡 추가 작성
            </button>
            <Link
              href="/"
              className="px-5 py-2.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium transition-colors"
            >
              UnoLive 에디터로 이동
            </Link>
          </div>
        </div>

        {/* 무대 sub모니터 이미지 — 섹션별 개별 다운로드 + 카톡용 링크 복사 */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <p className="text-xs text-gray-400 mb-4">
            찬양대·무대팀에게 보낼 검정 배경 큰 글자 이미지입니다. 개별로 저장하거나 아래
            <span className="font-semibold text-gray-600"> 카톡용 링크 복사</span>로 공유하세요.
          </p>
          <ChoirPromptImageGallery
            sections={submitted.item.sections}
            promptLayout={submitted.item.promptLayout ?? 'black-white'}
            songTitle={submitted.songTitle}
            shareUrl={shareUrl}
          />
        </div>
      </div>
    );
  }

  // ── 입력 폼 ──
  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

        {/* ── 헤더 ── */}
        <div className="px-8 py-6 bg-gradient-to-r from-violet-600 to-indigo-600">
          <h2 className="text-lg font-bold text-white">
            {editId ? '찬양대 자막 수정' : '찬양대 자막 요청'}
          </h2>
          <p className="text-violet-200 text-sm mt-1">
            가사를 입력하면 UnoLive에 자동으로 등록됩니다
          </p>
        </div>

        <div className="px-8 pt-6">
          <CopyrightComplianceNotice compact />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">

          {/* ── 좌측: 입력 폼 ── */}
          <div className="lg:col-span-3 p-8 space-y-6">

            {/* 1. 워쉽 정보 */}
            <fieldset>
              <legend className="text-xs font-bold text-violet-700 uppercase tracking-widest mb-3">
                1. 워쉽 정보
              </legend>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">정기예배 선택</label>
                  <select
                    value={worshipType}
                    onChange={(e) => {
                      setWorshipType(e.target.value);
                      if (e.target.value !== WORSHIP_OTHER_VALUE) setCustomWorshipName('');
                      setCustomDate('');
                    }}
                    className="w-full h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                  >
                    {WORSHIP_SELECT_OPTIONS.map((w) => (
                      <option key={w.value} value={w.value}>{w.label}</option>
                    ))}
                  </select>
                </div>
                {worshipType === WORSHIP_OTHER_VALUE && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">기타 예배/집회명</label>
                    <input
                      value={customWorshipName}
                      onChange={(e) => setCustomWorshipName(e.target.value)}
                      placeholder="예: 부흥회, 특별새벽기도회, 찬양집회"
                      className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    날짜 {!customDate && <span className="text-violet-500">(자동: {worshipDisplayDate})</span>}
                  </label>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                  />
                </div>
                <div className="bg-violet-50 rounded-lg px-4 py-3">
                  <p className="text-xs text-gray-500">워쉽 ID</p>
                  <p className="text-sm font-bold text-violet-800 font-mono">{worshipId}</p>
                </div>
              </div>
            </fieldset>

            {/* 2. 찬양곡 정보 */}
            <fieldset>
              <legend className="text-xs font-bold text-violet-700 uppercase tracking-widest mb-3">
                2. 찬양곡 정보
              </legend>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    곡명 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={songTitle}
                    onChange={(e) => setSongTitle(e.target.value)}
                    placeholder="예: 주 하나님 지으신 모든 세계"
                    className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      작곡가 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={composer}
                      onChange={(e) => setComposer(e.target.value)}
                      placeholder="예: 스웨덴 전래곡"
                      className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">편곡자</label>
                    <input
                      type="text"
                      value={arranger}
                      onChange={(e) => setArranger(e.target.value)}
                      placeholder="(선택)"
                      className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    가사 <span className="text-red-500">*</span>
                    <span className="ml-2 text-gray-400 font-normal">
                      (빈 줄로 섹션 구분)
                    </span>
                  </label>
                  <textarea
                    value={lyrics}
                    onChange={(e) => setLyrics(e.target.value)}
                    placeholder={`1절 가사를 입력하세요\n여기는 같은 섹션입니다\n\n빈 줄 하나 띄우면\n새로운 섹션이 됩니다\n\n후렴\n후렴 가사 입력`}
                    rows={12}
                    className="w-full px-3 py-3 rounded-lg border border-gray-300 text-sm leading-relaxed resize-y focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">비고</label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="특이사항, 참고사항 등"
                    className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                  />
                </div>
              </div>
            </fieldset>

            {/* 제출 버튼 */}
            <button
              onClick={handleSubmit}
              disabled={!isValid || submitting}
              className={`w-full h-12 rounded-xl text-white font-bold text-sm transition-all ${
                isValid && !submitting
                  ? 'bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-200 active:scale-[0.98]'
                  : 'bg-gray-300 cursor-not-allowed'
              }`}
            >
              {submitting ? '등록 중...' : editId ? '수정 완료' : 'UnoLive에 등록'}
            </button>
          </div>

          {/* ── 우측: 섹션 미리보기 + 저장된 프로그램 목록 ── */}
          <div className="lg:col-span-2 p-6 bg-gray-50 space-y-6">
            {/* 섹션 미리보기 */}
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
                섹션 미리보기
                {previewSections.length > 0 && (
                  <span className="ml-2 text-violet-600">{previewSections.length}개 섹션</span>
                )}
              </h3>
              {previewSections.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-xs text-gray-400">
                  가사를 입력하면 섹션이 표시됩니다
                </div>
              ) : (
                <div className="space-y-2">
                  {songTitle && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-yellow-700 mb-1">표지</p>
                      <p className="text-xs text-gray-800 font-semibold">{songTitle}</p>
                      {composer && <p className="text-[10px] text-gray-500">작곡: {composer}</p>}
                      {arranger && <p className="text-[10px] text-gray-500">편곡: {arranger}</p>}
                    </div>
                  )}
                  {previewSections.map((block, i) => (
                    <div key={i} className="bg-white border border-gray-200 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-violet-600 mb-1">{i + 1}절</p>
                      <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{block}</p>
                    </div>
                  ))}
                  {note.trim() && (
                    <div className="bg-slate-100 border border-slate-200 rounded-lg p-3">
                      <p className="text-[10px] font-bold text-slate-500 mb-1">비고</p>
                      <p className="text-xs text-gray-600">{note}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 저장된 프로그램 목록 */}
            <SavedProgramList currentEditId={editId} />
          </div>

        </div>
      </div>
    </div>
  );
}

// ── 올린 이력(저장된 프로그램) 목록 — 항상 표시 + 삭제 + 바로 불러오기 ──
function SavedProgramList({ currentEditId }: { currentEditId: string | null }) {
  const [programs, setPrograms] = useState<SavedProgram[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/programs?type=choir');
        if (res.ok) {
          const { programs: list } = await res.json();
          setPrograms(list);
        }
      } catch {
        // 무시
      } finally {
        setLoadingList(false);
      }
    })();
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm('이 요청을 삭제할까요? 되돌릴 수 없습니다.')) return;
    try {
      const res = await fetch(`/api/programs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPrograms((prev) => prev.filter((p) => p.id !== id));
      }
    } catch {
      // 무시
    }
  }, []);

  return (
    <div>
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
        올린 이력
        {programs.length > 0 && <span className="ml-2 text-violet-600">{programs.length}건</span>}
      </h3>

      {loadingList ? (
        <div className="text-xs text-gray-400 text-center py-4">불러오는 중...</div>
      ) : programs.length === 0 ? (
        <div className="flex items-center justify-center h-24 rounded-lg border border-dashed border-gray-200 text-xs text-gray-400">
          아직 올린 이력이 없습니다.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {programs.map((p) => (
            <div
              key={p.id}
              className={`rounded-lg border overflow-hidden transition-all ${
                currentEditId === p.id
                  ? 'border-violet-400 bg-violet-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {/* 정보 영역: 클릭 시 수정 모드 */}
              <a
                href={`/media/fellowship?tab=choir-subtitle&edit=${p.id}`}
                className="block px-3 py-2.5 text-left hover:bg-violet-50/60 transition-colors"
              >
                <p className="text-xs font-semibold text-gray-800 truncate">
                  {p.item.title}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-violet-600 font-medium">
                    {p.worshipName}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {p.item.sections.length}개 섹션
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {new Date(p.updatedAt).toLocaleString('ko-KR')}
                </p>
              </a>

              {/* 액션: 수정 · 바로 불러오기 · 삭제 */}
              <div className="flex items-stretch border-t border-gray-100 divide-x divide-gray-100">
                <a
                  href={`/media/fellowship?tab=choir-subtitle&edit=${p.id}`}
                  className="flex-1 py-1.5 text-center text-[10px] font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors"
                >
                  수정
                </a>
                <a
                  href={`/composer?loadWorship=${encodeURIComponent(p.worshipId)}`}
                  className="flex-1 py-1.5 text-center text-[10px] font-semibold text-violet-600 hover:bg-violet-50 transition-colors"
                >
                  불러오기
                </a>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="flex-1 py-1.5 text-center text-[10px] font-semibold text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
