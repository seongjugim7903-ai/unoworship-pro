'use client';

// 예배 자막 협조 폼 — 정기예배를 선택하고 설교·교독문·찬송가·찬양 정보를 넣으면
// 선택한 템플릿으로 예배 순서 전체를 프로그램화해 서버에 저장한다("워십 불러오기"로 수신).

import { useState, useMemo, useEffect } from 'react';
import { useMediaStore } from '@/lib/media/mediaStore';
import {
  WORSHIP_OTHER_VALUE,
  WORSHIP_SELECT_OPTIONS,
  formatYYYYMMDD,
  getNextRegularWorshipDate,
} from '@/lib/media/worshipDefaults';
import {
  submitWorshipService,
  getPlannedPrograms,
  getRegularProgramOptions,
  getUpcomingWorshipType,
  type WorshipServiceForm as FormData,
  type WorshipServiceResult,
  type RegularProgramId,
} from '@/lib/generators/worshipServiceGenerator';
import { listTemplates } from '@/features/subtitle-template/templateClient';
import type { SubtitleTemplate } from '@/features/subtitle-template/model';
import type { SavedProgram } from '@/lib/generators/programTypes';
import QuoteProgramCreateButton from './QuoteProgramCreateButton';

// 설교자 선택지 — 순서 고정, 마지막 '직접기입' 선택 시 텍스트 입력
const PREACHER_OPTIONS = ['한만상 목사', '김동경 강도사'];
const PREACHER_CUSTOM = '직접기입';

/** 월삭감사예배 = 매월 1일 (오늘이 1일이면 오늘, 지났으면 다음 달 1일) */
function getNextFirstOfMonth(base = new Date()): Date {
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  if (base.getDate() > 1) first.setMonth(first.getMonth() + 1);
  return first;
}

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none';
const textareaCls =
  'w-full px-3 py-3 rounded-lg border border-gray-300 text-sm leading-relaxed resize-y focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none font-mono';
const legendCls = 'text-xs font-bold text-violet-700 uppercase tracking-widest mb-3';
const labelCls = 'block text-xs font-medium text-gray-600 mb-1';
const DEFAULT_TEMPLATE_NAME = 'basic-001';

export default function WorshipServiceForm() {
  // 설교자 섹션의 소속/교회 슬롯에 들어갈 교회 이름 — 직접기입 (활성 교회가 있으면 초기값, 없으면 울주교회)
  const activeChurch = useMediaStore((s) => s.getActiveChurch());
  const [churchName, setChurchName] = useState(() => activeChurch?.name?.trim() || '울주교회');
  // 다가오는 정기예배가 자동 선택된다 (예: 수요일 저녁 예배 전이면 수요예배).
  // 수동 변경은 미리 준비할 때만.
  const [worshipType, setWorshipType] = useState(() => getUpcomingWorshipType());
  const [customWorshipName, setCustomWorshipName] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [worshipFileNameInput, setWorshipFileNameInput] = useState('');
  const [templateName, setTemplateName] = useState(DEFAULT_TEMPLATE_NAME);
  const [templates, setTemplates] = useState<SubtitleTemplate[]>([]);
  // 설교대지
  const [sermonTitle, setSermonTitle] = useState('');
  const [scriptureRef, setScriptureRef] = useState('');
  const [preacherSelect, setPreacherSelect] = useState(PREACHER_OPTIONS[0]);
  const [customPreacher, setCustomPreacher] = useState('');
  const [quotesText, setQuotesText] = useState('');
  // 찬송가(장 번호만 — 가사는 로컬 데이터 자동) · 찬양
  const [hymn1Number, setHymn1Number] = useState('');
  const [hymn2Number, setHymn2Number] = useState('');
  // 추가 찬송가 — "찬송가 추가" 버튼으로 늘리는 장 번호들 (설교 후 뒤에 순서대로)
  const [extraHymns, setExtraHymns] = useState<string[]>([]);
  // 4. 목사님 찬양 — PPT 변환본에서 곡명 검색
  const [praiseSongs, setPraiseSongs] = useState('');
  // 5. 준비찬양 — PPT 변환본을 하나의 사용자 지정 프로그램으로 묶음
  const [preparationPraiseProgramName, setPreparationPraiseProgramName] = useState('');
  const [preparationPraiseSongs, setPreparationPraiseSongs] = useState('');
  // 주일낮예배 추가 프로그램 — 템플릿 등록 전까지 내용 필드만 받는다.
  const [campaignText, setCampaignText] = useState('');
  const [churchNewsText, setChurchNewsText] = useState('');
  const [selectedRegularProgramIds, setSelectedRegularProgramIds] = useState<RegularProgramId[]>([]);
  const [fixedPrograms, setFixedPrograms] = useState<SavedProgram[]>([]);
  const [selectedFixedProgramIds, setSelectedFixedProgramIds] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<WorshipServiceResult | null>(null);

  const actualWorshipType =
    worshipType === WORSHIP_OTHER_VALUE ? customWorshipName.trim() : worshipType;

  const autoDate = useMemo(
    () =>
      worshipType === '월삭감사예배'
        ? getNextFirstOfMonth()
        : getNextRegularWorshipDate(worshipType),
    [worshipType],
  );
  const worshipDate = customDate ? customDate.replace(/-/g, '') : formatYYYYMMDD(autoDate);
  const defaultWorshipFileName = `${worshipDate}-worship`;
  const worshipFileName = worshipFileNameInput || defaultWorshipFileName;
  // 날짜 입력칸에 자동 선택된 예배일을 채워서 보여준다 (수동 변경 시 customDate 로 덮어씀)
  const autoDateISO = `${autoDate.getFullYear()}-${String(autoDate.getMonth() + 1).padStart(2, '0')}-${String(autoDate.getDate()).padStart(2, '0')}`;
  const templateNames = useMemo(() => {
    const names = new Set<string>([DEFAULT_TEMPLATE_NAME]);
    templates.forEach((template) => {
      if (template.name.trim()) names.add(template.name.trim());
    });
    return [...names];
  }, [templates]);
  const regularProgramOptions = useMemo(
    () => getRegularProgramOptions(actualWorshipType),
    [actualWorshipType],
  );
  const eligibleRegularProgramIds = useMemo(
    () => regularProgramOptions.filter((option) => option.eligible).map((option) => option.id),
    [regularProgramOptions],
  );

  useEffect(() => {
    void listTemplates().then(setTemplates);
    void fetch('/api/fixed-programs', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { programs?: SavedProgram[] } | null) => {
        if (Array.isArray(data?.programs)) setFixedPrograms(data.programs);
      })
      .catch(() => setFixedPrograms([]));
  }, []);

  useEffect(() => {
    setSelectedRegularProgramIds((current) =>
      current.filter((id) => eligibleRegularProgramIds.includes(id)),
    );
  }, [eligibleRegularProgramIds]);

  const toggleRegularProgram = (id: RegularProgramId) => {
    if (!eligibleRegularProgramIds.includes(id)) return;
    setSelectedRegularProgramIds((current) =>
      current.includes(id)
        ? current.filter((currentId) => currentId !== id)
        : [...current, id],
    );
  };

  const praiseCount = praiseSongs.split('\n').filter((s) => s.trim()).length;
  const preparationPraiseCount = preparationPraiseSongs.split('\n').filter((s) => s.trim()).length;
  const planned = useMemo(
    () =>
      getPlannedPrograms(actualWorshipType, {
        hasHymn1: !!hymn1Number.trim(),
        hasHymn2: !!hymn2Number.trim(),
        hasQuotes: !!quotesText.trim(),
        praiseCount,
        preparationPraiseCount,
        preparationPraiseProgramName,
        extraHymnCount: extraHymns.filter((h) => h.trim()).length,
        selectedRegularProgramIds,
      }),
    [actualWorshipType, hymn1Number, hymn2Number, quotesText, praiseCount, preparationPraiseCount, preparationPraiseProgramName, extraHymns, selectedRegularProgramIds],
  );

  const actualPreacher =
    preacherSelect === PREACHER_CUSTOM ? customPreacher.trim() : preacherSelect;

  const isValid =
    !!actualWorshipType && !!sermonTitle.trim() && !!scriptureRef.trim() && !!actualPreacher;

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      const form: FormData = {
        worshipType: actualWorshipType,
        worshipDate,
        worshipFileName,
        templateName,
        sermonTitle: sermonTitle.trim(),
        scriptureRef: scriptureRef.trim(),
        preacher: actualPreacher,
        churchName: churchName.trim(),
        quotesText,
        hymn1Number,
        hymn2Number,
        extraHymnNumbers: extraHymns.map((h) => h.trim()).filter((h) => h),
        praiseSongs,
        preparationPraiseProgramName: preparationPraiseProgramName.trim(),
        preparationPraiseSongs,
        selectedRegularProgramIds,
        selectedFixedProgramIds,
        campaignText,
        churchNewsText,
      };
      const res = await submitWorshipService(form);
      setResult(res);
    } catch (err) {
      console.error('예배 자막 협조 제출 실패:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // ── 완료 화면 ──
  if (result) {
    const savedCount = result.programs.filter((p) => p.saved).length;
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">예배 자막 준비 완료</h2>
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-emerald-700">{result.worshipName}</span>
              <span className="ml-2 font-mono text-xs text-gray-400">{result.worshipId}</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              프로그램 {savedCount}개 저장됨 — 컴포저의 &ldquo;워십 불러오기&rdquo;에서 수신됩니다.
            </p>
          </div>

          <div className="space-y-1.5 mb-6">
            {result.programs.map((p, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                <span className="text-xs font-semibold text-gray-800 truncate">{p.title}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-gray-400">{p.sectionCount}개 섹션</span>
                  {p.saved ? (
                    <span className="text-[10px] font-bold text-emerald-600">저장됨</span>
                  ) : (
                    <span className="text-[10px] font-bold text-red-500">실패</span>
                  )}
                </span>
              </div>
            ))}
          </div>

          {result.skippedPraise.length > 0 && (
            <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">PPT 변환본을 찾지 못한 찬양 (배치 생략)</p>
              <p className="text-xs text-amber-600">{result.skippedPraise.join(', ')}</p>
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="mb-4 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 space-y-1">
              {result.warnings.map((w, i) => (
                <p key={i} className="text-[11px] text-gray-500">· {w}</p>
              ))}
            </div>
          )}

          <div className="flex gap-3 justify-center">
            {/* 같은 탭으로 콤포즈 복귀 → ?loadWorship 로 진입하면 ServerWorshipLoader 가 자동으로
                생성된 워십을 프로그램으로 불러온다(새 탭 열지 않음). */}
            <a
              href={`/composer?loadWorship=${encodeURIComponent(result.worshipId)}`}
              className="px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
            >
              컴포저에서 불러오기
            </a>
            <button
              onClick={() => setResult(null)}
              className="px-5 py-2.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium transition-colors"
            >
              다른 예배 작성
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 입력 폼 ──
  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-8 py-6 bg-gradient-to-r from-violet-600 to-indigo-600">
          <h2 className="text-lg font-bold text-white">예배 자막 협조</h2>
          <p className="text-violet-200 text-sm mt-1">
            워십 ID <span className="ml-1 font-mono font-semibold text-white">{worshipFileName}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
          {/* ── 좌측: 입력 ── */}
          <div className="lg:col-span-3 p-8 space-y-6">
            {/* 1. 워쉽 정보 */}
            <fieldset>
              <legend className={legendCls}>1. 워쉽 정보</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className={labelCls}>정기예배 선택</label>
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
                      <option key={w.value} value={w.value}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>날짜</label>
                  <input
                    type="date"
                    value={customDate || autoDateISO}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>자막 템플릿</label>
                  <select
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className={inputCls}
                  >
                    {templateNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>저장 파일명</label>
                  <input
                    value={worshipFileName}
                    onChange={(e) => {
                      const next = e.target.value
                        .replace(/\s+/g, '-')
                        .replace(/[^a-zA-Z0-9가-힣_\-]/g, '');
                      setWorshipFileNameInput(next === defaultWorshipFileName ? '' : next);
                    }}
                    className={inputCls}
                  />
                </div>
              </div>
              {worshipType === WORSHIP_OTHER_VALUE && (
                <div className="mt-3">
                  <label className={labelCls}>기타 예배/집회명</label>
                  <input
                    value={customWorshipName}
                    onChange={(e) => setCustomWorshipName(e.target.value)}
                    placeholder="예: 부흥회, 특별새벽기도회"
                    className={inputCls}
                  />
                </div>
              )}
            </fieldset>

            {/* 2. 설교대지 */}
            <fieldset>
              <legend className={legendCls}>2. 설교대지</legend>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>설교제목 <span className="text-red-500">*</span></label>
                  <input value={sermonTitle} onChange={(e) => setSermonTitle(e.target.value)} placeholder="예: 십자가의 도" className={inputCls} />
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <label className={labelCls}>
                      요절 <span className="text-red-500">*</span>
                    </label>
                    <input value={scriptureRef} onChange={(e) => setScriptureRef(e.target.value)} placeholder="예: 벧전 2:5-9" className={inputCls} />
                    <p className="mt-1 text-[10px] leading-relaxed text-gray-400">
                      본문묵상·말씀찾기에 사용
                    </p>
                  </div>
                  <div>
                    <label className={labelCls}>설교자 <span className="text-red-500">*</span></label>
                    <select
                      value={preacherSelect}
                      onChange={(e) => {
                        setPreacherSelect(e.target.value);
                        if (e.target.value !== PREACHER_CUSTOM) setCustomPreacher('');
                      }}
                      className="w-full h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                    >
                      {PREACHER_OPTIONS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                      <option value={PREACHER_CUSTOM}>{PREACHER_CUSTOM}</option>
                    </select>
                    {preacherSelect === PREACHER_CUSTOM && (
                      <input
                        value={customPreacher}
                        onChange={(e) => setCustomPreacher(e.target.value)}
                        placeholder="설교자 이름 직접 입력"
                        className={`${inputCls} mt-2`}
                      />
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>소속교회</label>
                    <input
                      value={churchName}
                      onChange={(e) => setChurchName(e.target.value)}
                      placeholder="예: 울주교회"
                      className={inputCls}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-gray-400">
                  본문묵상 = 입력한 요절 그대로 크게 · 말씀찾기(본문) = 1절부터 끝절까지 절별 자동 섹션화
                </p>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <label className={`${labelCls} mb-0`}>말씀찾기(인용) · 대지타이틀</label>
                    <QuoteProgramCreateButton
                      worshipDate={worshipDate}
                      templateName={templateName}
                      quotesText={quotesText}
                    />
                  </div>
                  <textarea
                    value={quotesText}
                    onChange={(e) => setQuotesText(e.target.value)}
                    rows={5}
                    placeholder={'롬 8:28\n1. 하나님의 능력\n고전 1:18\n2. 십자가의 지혜'}
                    className={textareaCls}
                  />
                </div>
              </div>
            </fieldset>

            {/* 3. 찬송가 — 장 번호만 (가사는 로컬 찬송가 데이터에서 자동) */}
            <fieldset>
              <legend className={legendCls}>3. 찬송가</legend>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>찬송가 1 (설교 전)</label>
                  <input value={hymn1Number} onChange={(e) => setHymn1Number(e.target.value)} placeholder="장 번호 (예: 79)" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>찬송가 2 (설교 후)</label>
                  <input value={hymn2Number} onChange={(e) => setHymn2Number(e.target.value)} placeholder="장 번호 (예: 345)" className={inputCls} />
                </div>
              </div>

              {/* 추가 찬송가 — 설교 후(찬송가 2) 뒤에 순서대로 배치 */}
              {extraHymns.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {extraHymns.map((val, i) => (
                    <div key={i}>
                      <label className={labelCls}>추가 찬송가 {i + 1}</label>
                      <div className="flex items-center gap-1">
                        <input
                          value={val}
                          onChange={(e) =>
                            setExtraHymns((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                          }
                          placeholder="장 번호"
                          className={inputCls}
                        />
                        <button
                          type="button"
                          onClick={() => setExtraHymns((prev) => prev.filter((_, j) => j !== i))}
                          className="shrink-0 w-8 h-9 rounded-lg border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200"
                          title="이 찬송가 삭제"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setExtraHymns((prev) => [...prev, ''])}
                className="mt-2 text-xs font-semibold text-violet-600 hover:text-violet-500"
              >
                + 찬송가 추가
              </button>
            </fieldset>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* 4. 목사님 찬양 */}
              <fieldset>
                <legend className={legendCls}>4. 목사님 찬양</legend>
                <textarea
                  value={praiseSongs}
                  onChange={(e) => setPraiseSongs(e.target.value)}
                  rows={3}
                  placeholder={'곡명을 한 줄에 하나씩 입력\n(저장된 PPT 변환본에서 검색)'}
                  className={textareaCls}
                />
              </fieldset>

              {/* 5. 준비찬양 — 프로그램 제목을 직접 정하고, 여러 PPT 곡을 하나로 묶는다 */}
              <fieldset>
                <legend className={`${legendCls} flex items-center justify-between gap-3`}>
                  <span className="shrink-0">5. 준비찬양</span>
                  <input
                    value={preparationPraiseProgramName}
                    onChange={(e) => setPreparationPraiseProgramName(e.target.value)}
                    aria-label="준비찬양 프로그램 이름"
                    placeholder="프로그램 이름"
                    className="min-w-0 flex-1 h-8 px-2 rounded-md border border-gray-300 bg-white text-xs font-normal normal-case tracking-normal text-gray-700 placeholder:text-gray-400 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                  />
                </legend>
                <textarea
                  value={preparationPraiseSongs}
                  onChange={(e) => setPreparationPraiseSongs(e.target.value)}
                  rows={3}
                  placeholder={'준비찬양 곡명을 한 줄에 하나씩 입력\n(입력한 프로그램 이름으로 하나의 프로그램에 묶어 생성)'}
                  className={textareaCls}
                />
              </fieldset>
            </div>

            {/* 주일낮예배 추가 프로그램 — 템플릿은 추후 등록 */}
            {worshipType === '주일낮예배' && (
              <fieldset className="mt-6">
                <legend className={legendCls}>추가 프로그램 필드</legend>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className={labelCls}>행복한 신앙생활 캠페인</label>
                    <textarea
                      value={campaignText}
                      onChange={(e) => setCampaignText(e.target.value)}
                      rows={3}
                      placeholder="캠페인 내용을 입력합니다."
                      className={textareaCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>교회소식</label>
                    <textarea
                      value={churchNewsText}
                      onChange={(e) => setChurchNewsText(e.target.value)}
                      rows={3}
                      placeholder="교회소식 내용을 입력합니다."
                      className={textareaCls}
                    />
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-gray-400">
                  헵시바 선교단은 오른쪽 구성에서 선택 시 저장된 PPT 이미지 프로그램을 가져옵니다.
                </p>
              </fieldset>
            )}

            <button
              onClick={handleSubmit}
              disabled={!isValid || submitting}
              className={`w-full h-12 rounded-xl text-white font-bold text-sm transition-all ${
                isValid && !submitting
                  ? 'bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-200 active:scale-[0.98]'
                  : 'bg-gray-300 cursor-not-allowed'
              }`}
            >
              {submitting ? '프로그램 생성 중...' : '예배 순서 생성'}
            </button>
          </div>

          {/* ── 우측: 구성 미리보기 ── */}
          <div className="lg:col-span-2 p-6 bg-gray-50">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
              {actualWorshipType || '예배'} 구성 미리보기
            </h3>
            <div className="space-y-1.5">
              {planned.map((p) => {
                const selectable = Boolean(p.selectable && p.regularProgramId);
                const visible = p.included || selectable;
                return (
                  <button
                    key={p.order}
                    type="button"
                    disabled={!selectable}
                    onClick={() => {
                      if (p.regularProgramId) toggleRegularProgram(p.regularProgramId);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                      p.included
                        ? 'border-violet-200 bg-white'
                        : selectable
                          ? 'border-violet-200 bg-white hover:border-violet-400 hover:bg-violet-50'
                          : 'border-gray-100 bg-gray-50 opacity-50'
                    } ${selectable ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <span className={`text-[10px] font-mono font-bold ${p.included ? 'text-violet-600' : visible ? 'text-violet-400' : 'text-gray-400'}`}>
                      {p.order}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-xs font-semibold ${visible ? 'text-gray-800' : 'text-gray-400'}`}>
                        {p.title}
                      </p>
                      <p className="truncate text-[10px] text-gray-400">{p.note}</p>
                    </div>
                    {selectable ? (
                      <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        p.included ? 'bg-emerald-50 text-emerald-600' : 'bg-violet-50 text-violet-600'
                      }`}>
                        {p.included ? '포함' : '가져오기'}
                      </span>
                    ) : (
                      p.included && <span className="shrink-0 text-[10px] font-bold text-emerald-600">포함</span>
                    )}
                  </button>
                );
              })}
            </div>
            {fixedPrograms.length > 0 && (
              <div className="mt-5 border-t border-gray-200 pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-gray-500">고정 라이브러리</h4>
                  <span className="text-[10px] text-gray-400">워십 생성 시 선택 자료 추가</span>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {fixedPrograms.map((program) => {
                    const included = selectedFixedProgramIds.includes(program.id);
                    return (
                      <button
                        key={program.id}
                        type="button"
                        onClick={() => setSelectedFixedProgramIds((current) =>
                          included ? current.filter((id) => id !== program.id) : [...current, program.id],
                        )}
                        className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-[11px] transition-colors ${
                          included
                            ? 'border-amber-300 bg-amber-50 text-amber-800'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-amber-300'
                        }`}
                      >
                        <span className="min-w-0 truncate">{program.item.title}</span>
                        <span className="shrink-0 text-[10px] font-bold">{included ? '포함' : '추가'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <p className="mt-4 text-[11px] text-gray-400 leading-relaxed">
              템플릿은 각 카테고리의 <span className="font-mono font-semibold">basic-001</span> 을 사용합니다.
              미등록 카테고리는 기본 디자인으로 생성되며, 나중에 템플릿 등록 후 다시 생성하면 반영됩니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
