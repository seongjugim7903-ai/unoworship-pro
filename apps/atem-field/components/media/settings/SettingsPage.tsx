'use client';

/**
 * SettingsPage — /media/settings
 *
 * 웹에서 관리하는 설정은 다음 네 가지로 한정됩니다:
 *   1. 일반 (general)        : 언어 · 테마 · 시간대
 *   2. 내 계정 (account)      : 프로필 · 알림 · 보안
 *   3. 교회 관리 (church)     : 교회 정보 · 부서 · 멤버 권한 (Lead 전용)
 *   4. 대시보드 (dashboard)   : 모니터링 대시보드 표시 옵션 (자동 새로고침 등)
 *
 * 그 외의 설정 (editor / output / broadcast / shortcuts / hardware) 은
 * **UnoLive 데스크탑 앱의 환경설정** 에서만 조작할 수 있습니다.
 * 송출 엔진 자체가 데스크탑에만 존재하기 때문입니다.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMediaStore } from '@/lib/media/mediaStore';
import { useAuthContext } from '@/lib/auth/AuthProvider';
import { ROLE_LABEL } from '@/lib/auth/types';
import type { UserRole } from '@/lib/auth/types';
import type { SyncMeta, SyncScope } from '@/lib/media/mediaTypes';
import CopyrightComplianceNotice from '@/components/compliance/CopyrightComplianceNotice';
import DevicesSettings from '@/components/media/settings/DevicesSettings';

// ─────────────────────────────────────────
// 섹션 정의 (웹 전용)
// ─────────────────────────────────────────
type SectionId = 'general' | 'account' | 'church' | 'dashboard' | 'copyright' | 'devices' | 'users';

interface SettingSection {
  id: SectionId;
  syncKey?: string;
  label: string;
  description: string;
  icon: string;
}

const SECTIONS: SettingSection[] = [
  { id: 'general',   syncKey: 'settings.general',   label: '일반',         description: '언어 · 테마 · 시간대',                icon: '⚙' },
  { id: 'account',                                  label: '내 계정',      description: '프로필 · 알림 · 보안',                 icon: '◉' },
  { id: 'church',                                   label: '교회 관리',    description: '교회 정보 · 부서 · 멤버 권한',          icon: '✦' },
  { id: 'dashboard', syncKey: 'settings.broadcast', label: '대시보드',     description: '모니터링 대시보드 표시 옵션',           icon: '◈' },
  { id: 'copyright',                                label: '저작권',        description: '성경 · 찬송 · 찬양 자료 사용 권한',     icon: '©' },
  { id: 'devices',                                  label: '연결된 기기',  description: 'UnoLive 앱이 설치된 PC 목록 · 해제',    icon: '▣' },
  { id: 'users',                                    label: '회원 관리',    description: '회원 등급 · 권한 설정',                 icon: '♛' },
];

// ─────────────────────────────────────────
// Scope 뱃지
// ─────────────────────────────────────────
const SCOPE_LABEL: Record<SyncScope, { label: string; color: string; desc: string }> = {
  church:         { label: '교회 공유',     color: 'bg-violet-50 text-violet-700 border-violet-200',  desc: '교회 전체에 적용됩니다' },
  user:           { label: '내 설정',       color: 'bg-sky-50 text-sky-700 border-sky-200',           desc: '사용자별로 저장됩니다' },
  local:          { label: '이 기기만',     color: 'bg-gray-100 text-gray-700 border-gray-200',       desc: '동기화되지 않습니다' },
  'desktop-only': { label: '데스크탑 전용', color: 'bg-amber-50 text-amber-800 border-amber-200',     desc: 'UnoLive 데스크탑 앱에서만 조작' },
};

function ScopeBadge({ scope }: { scope: SyncScope }) {
  const s = SCOPE_LABEL[scope];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${s.color}`}
      title={s.desc}
    >
      {s.label}
    </span>
  );
}

function SyncStatusBadge({ meta }: { meta?: SyncMeta }) {
  if (!meta) return null;
  const map = {
    synced:   { color: 'text-emerald-600', label: '● 동기화됨' },
    syncing:  { color: 'text-sky-600',     label: '↻ 동기화 중' },
    pending:  { color: 'text-amber-600',   label: '… 대기 중'   },
    offline:  { color: 'text-gray-500',    label: '○ 오프라인'  },
    conflict: { color: 'text-red-600',     label: '⚠ 충돌'      },
  } as const;
  const s = map[meta.status];
  const ago = meta.lastSyncedAt
    ? `${Math.max(1, Math.round((Date.now() - meta.lastSyncedAt) / 60000))}분 전`
    : '미동기';
  return (
    <span className={`text-[10px] font-semibold ${s.color}`}>
      {s.label} · {ago}
    </span>
  );
}

// ─────────────────────────────────────────
// 메인 페이지
// ─────────────────────────────────────────
export default function SettingsPage() {
  const [active, setActive] = useState<SectionId>('general');
  const syncMeta = useMediaStore((s) => s.syncMeta);
  const current = useMediaStore((s) => s.getCurrentMember());
  const { role: authRole } = useAuthContext();
  const isSuperadmin = authRole === 'superadmin';

  // superadmin이 아니면 '회원 관리' 섹션 숨김
  const visibleSections = useMemo(
    () => isSuperadmin ? SECTIONS : SECTIONS.filter((s) => s.id !== 'users'),
    [isSuperadmin]
  );

  const activeSection = useMemo(
    () => visibleSections.find((s) => s.id === active) ?? visibleSections[0],
    [active, visibleSections]
  );
  const activeMeta = activeSection.syncKey ? syncMeta[activeSection.syncKey] : undefined;

  return (
    <main className="w-full max-w-[1440px] mx-auto px-6 py-8">
      {/* 헤더 */}
      <section className="mb-6">
        <p className="text-[11px] font-semibold tracking-widest text-violet-600 uppercase">설정</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">환경 설정</h1>
        <p className="mt-1 text-sm text-gray-500">
          멤버 · 교회 · 대시보드 설정을 관리합니다.
          녹화 / 라이브 / 출력 / 단축키 등 송출 관련 설정은 <span className="font-semibold text-gray-700">UnoLive 데스크탑 앱</span>에서 관리됩니다.
        </p>
      </section>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* 좌측 섹션 네비 */}
        <nav className="lg:w-[260px] shrink-0">
          <ul className="space-y-1">
            {visibleSections.map((s) => {
              const meta = s.syncKey ? syncMeta[s.syncKey] : undefined;
              const isActive = s.id === active;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setActive(s.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                      isActive
                        ? 'bg-violet-50 border-violet-300 text-violet-900'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-violet-200 hover:bg-violet-50/40'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className={`text-sm leading-5 ${isActive ? 'text-violet-600' : 'text-gray-400'}`}>
                        {s.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-[12px] font-bold truncate">{s.label}</p>
                          {meta && <ScopeBadge scope={meta.scope} />}
                        </div>
                        <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                          {s.description}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* 데스크탑 전용 안내 */}
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-[10px] font-bold text-amber-800 uppercase mb-1">데스크탑 전용 설정</p>
            <p className="text-[10px] text-amber-800 leading-relaxed">
              녹화 · 라이브 · 출력 · 에디터 · 단축키 · 하드웨어 설정은 UnoLive 데스크탑 앱 안에 있습니다.
            </p>
            <a
              href="/media/product"
              className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-900 hover:text-amber-700"
            >
              데스크탑 다운로드 →
            </a>
          </div>

          {/* 범례 */}
          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-[10px] font-bold text-gray-600 uppercase mb-2">동기화 범위</p>
            <ul className="space-y-1.5 text-[10px] text-gray-600">
              <li className="flex items-center gap-2"><ScopeBadge scope="church" /> 교회 전체에 적용</li>
              <li className="flex items-center gap-2"><ScopeBadge scope="user" /> 사용자별 저장</li>
              <li className="flex items-center gap-2"><ScopeBadge scope="local" /> 이 기기만</li>
            </ul>
          </div>
        </nav>

        {/* 우측 상세 */}
        <section className="flex-1 min-w-0">
          {/* 섹션 헤더 */}
          <header className="mb-4 pb-4 border-b border-gray-200 flex items-end justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span className="text-violet-500">{activeSection.icon}</span>
                {activeSection.label}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">{activeSection.description}</p>
            </div>
            <div className="flex items-center gap-3">
              {activeMeta && <ScopeBadge scope={activeMeta.scope} />}
              <SyncStatusBadge meta={activeMeta} />
            </div>
          </header>

          {/* 섹션별 내용 */}
          {active === 'general'   && <GeneralSettings />}
          {active === 'account'   && <AccountSettings memberName={current?.name} />}
          {active === 'church'    && <ChurchSettings />}
          {active === 'dashboard' && <DashboardSettings />}
          {active === 'copyright' && <CopyrightSettings />}
          {active === 'devices'   && <DevicesSettings />}
          {active === 'users'     && <UserManagementSettings />}
        </section>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────
// 공통 필드 컴포넌트
// ─────────────────────────────────────────
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[10px] text-gray-400">{hint}</p>}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 mb-4">{children}</div>
  );
}

// ─────────────────────────────────────────
// 1. 일반
// ─────────────────────────────────────────
function GeneralSettings() {
  return (
    <Card>
      <Field label="언어">
        <select className="w-full h-9 px-2 rounded-md border border-gray-300 bg-white text-[12px] text-gray-800">
          <option>한국어</option>
          <option>English</option>
        </select>
      </Field>
      <Field label="테마">
        <div className="grid grid-cols-3 gap-2">
          {['라이트', '다크', '시스템'].map((t) => (
            <button
              key={t}
              className="h-9 rounded-md border border-gray-300 bg-white text-[12px] font-medium text-gray-700 hover:border-violet-400 hover:text-violet-700"
            >
              {t}
            </button>
          ))}
        </div>
      </Field>
      <Field label="시간대" hint="교회 지역 설정에 따라 자동 적용됩니다.">
        <select className="w-full h-9 px-2 rounded-md border border-gray-300 bg-white text-[12px] text-gray-800">
          <option>Asia/Seoul (KST · UTC+9)</option>
        </select>
      </Field>
    </Card>
  );
}

// ─────────────────────────────────────────
// 2. 내 계정
// ─────────────────────────────────────────
function AccountSettings({ memberName }: { memberName?: string }) {
  return (
    <Card>
      <Field label="이름">
        <input
          type="text"
          defaultValue={memberName ?? ''}
          className="w-full h-9 px-2.5 rounded-md border border-gray-300 bg-white text-[12px] text-gray-800"
        />
      </Field>
      <Field label="프로필 사진">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white font-bold">
            {memberName?.[0] ?? '?'}
          </div>
          <button className="px-3 h-9 rounded-md border border-gray-300 bg-white text-[12px] font-medium text-gray-700 hover:border-violet-400 hover:text-violet-700">
            이미지 변경
          </button>
        </div>
      </Field>
      <Field label="알림">
        <div className="space-y-2">
          {[
            '주일 예배 리허설 알림',
            '내가 Active Operator 인 세션의 경고',
            '공지 게시 알림',
            '권한 인계 요청',
          ].map((o) => (
            <label key={o} className="flex items-center gap-2 text-[12px] text-gray-700">
              <input type="checkbox" defaultChecked className="accent-violet-600" />
              {o}
            </label>
          ))}
        </div>
      </Field>
      <Field label="세션 로그아웃">
        <button className="px-3 h-9 rounded-md border border-gray-300 bg-white text-[12px] font-medium text-gray-700 hover:border-red-300 hover:text-red-700">
          이 기기에서 로그아웃
        </button>
      </Field>
    </Card>
  );
}

// ─────────────────────────────────────────
// 3. 교회 관리
// ─────────────────────────────────────────
interface ChurchData {
  name: string;
  senior_pastor: string;
  denomination: string;
  region: string;
}

const EMPTY_CHURCH: ChurchData = { name: '', senior_pastor: '', denomination: '', region: '' };

function ChurchSettings() {
  const { hasAccess } = useAuthContext();
  const canEdit = hasAccess('admin');

  const [form, setForm] = useState<ChurchData>(EMPTY_CHURCH);
  const [saved, setSaved] = useState<ChurchData>(EMPTY_CHURCH);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // 로드
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/church');
        if (!res.ok) throw new Error('fetch failed');
        const { church } = await res.json();
        if (church) {
          const d: ChurchData = {
            name: church.name ?? '',
            senior_pastor: church.senior_pastor ?? '',
            denomination: church.denomination ?? '',
            region: church.region ?? '',
          };
          setForm(d);
          setSaved(d);
        }
      } catch {
        /* 아직 데이터 없음 — 빈 폼 */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isDirty =
    form.name !== saved.name ||
    form.senior_pastor !== saved.senior_pastor ||
    form.denomination !== saved.denomination ||
    form.region !== saved.region;

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/church', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setSaved({ ...form });
      setMsg({ type: 'ok', text: '저장되었습니다' });
      setTimeout(() => setMsg(null), 3000);
    } catch (e: unknown) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : '저장 실패' });
    } finally {
      setSaving(false);
    }
  };

  const update = (key: keyof ChurchData, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  if (loading) {
    return (
      <Card>
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-gray-400">교회 정보 불러오는 중...</p>
        </div>
      </Card>
    );
  }

  return (
    <>
      {/* 상태 메시지 */}
      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-lg border text-[12px] ${
          msg.type === 'ok'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {msg.text}
        </div>
      )}

      <Card>
        <Field label="교회 이름">
          <input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="예: 사랑의교회"
            disabled={!canEdit}
            className="w-full h-9 px-2.5 rounded-md border border-gray-300 bg-white text-[12px] text-gray-800 disabled:bg-gray-50 disabled:text-gray-500"
          />
        </Field>
        <Field label="담임목사">
          <input
            type="text"
            value={form.senior_pastor}
            onChange={(e) => update('senior_pastor', e.target.value)}
            placeholder="예: 홍길동"
            disabled={!canEdit}
            className="w-full h-9 px-2.5 rounded-md border border-gray-300 bg-white text-[12px] text-gray-800 disabled:bg-gray-50 disabled:text-gray-500"
          />
        </Field>
        <Field label="교단">
          <input
            type="text"
            value={form.denomination}
            onChange={(e) => update('denomination', e.target.value)}
            placeholder="예: 대한예수교장로회(합동)"
            disabled={!canEdit}
            className="w-full h-9 px-2.5 rounded-md border border-gray-300 bg-white text-[12px] text-gray-800 disabled:bg-gray-50 disabled:text-gray-500"
          />
        </Field>
        <Field label="지역">
          <input
            type="text"
            value={form.region}
            onChange={(e) => update('region', e.target.value)}
            placeholder="예: 경기도 수원시"
            disabled={!canEdit}
            className="w-full h-9 px-2.5 rounded-md border border-gray-300 bg-white text-[12px] text-gray-800 disabled:bg-gray-50 disabled:text-gray-500"
          />
        </Field>

        {/* 저장 버튼 (admin 이상만) */}
        {canEdit && (
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="px-4 h-9 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
            {isDirty && (
              <span className="text-[10px] text-amber-600">변경사항이 있습니다</span>
            )}
          </div>
        )}

        {!canEdit && (
          <p className="mt-2 text-[10px] text-gray-400">
            관리자 이상만 교회 정보를 수정할 수 있습니다.
          </p>
        )}
      </Card>
    </>
  );
}

// ─────────────────────────────────────────
// 4. 대시보드 표시 옵션
// ─────────────────────────────────────────
function DashboardSettings() {
  return (
    <Card>
      <Field label="자동 새로고침 주기" hint="서버 연결 끊김 시 다시 연결 시도 주기">
        <select className="w-full h-9 px-2 rounded-md border border-gray-300 bg-white text-[12px] text-gray-800">
          <option>1초</option>
          <option>3초</option>
          <option>5초</option>
          <option>수동</option>
        </select>
      </Field>
      <Field label="기본 뷰">
        <div className="grid grid-cols-2 gap-2">
          {['프리뷰 중심', '메트릭 중심'].map((v) => (
            <button
              key={v}
              className="h-9 rounded-md border border-gray-300 bg-white text-[12px] font-medium text-gray-700 hover:border-violet-400 hover:text-violet-700"
            >
              {v}
            </button>
          ))}
        </div>
      </Field>
      <Field label="알림 기준">
        <div className="space-y-2">
          {[
            { label: '비트레이트 하락 경고', on: true },
            { label: '시청자 급감 경고',   on: true },
            { label: '녹화 자동 종료 시 알림', on: true },
            { label: '데스크탑 연결 끊김 경고', on: true },
          ].map((o) => (
            <label key={o.label} className="flex items-center gap-2 text-[12px] text-gray-700">
              <input type="checkbox" defaultChecked={o.on} className="accent-violet-600" />
              {o.label}
            </label>
          ))}
        </div>
      </Field>
      <Field label="사고 로그 자동 기록">
        <div className="space-y-2">
          {[
            '녹화 시작/정지',
            '라이브 연결/종료',
            '오퍼레이터 권한 변경',
            '데스크탑 연결 상태 변화',
          ].map((o) => (
            <label key={o} className="flex items-center gap-2 text-[12px] text-gray-700">
              <input type="checkbox" defaultChecked className="accent-violet-600" />
              {o}
            </label>
          ))}
        </div>
      </Field>
    </Card>
  );
}

// ─────────────────────────────────────────
// 5. 저작권 관리
// ─────────────────────────────────────────
function CopyrightSettings() {
  return (
    <>
      <CopyrightComplianceNotice className="mb-4" />

      <Card>
        <div className="mb-4">
          <h3 className="text-[13px] font-bold text-gray-900">기본 원칙</h3>
          <p className="mt-1 text-[12px] leading-5 text-gray-500">
            UnoWorship은 성경 본문, 찬송가 가사, CCM/찬양곡 가사, 악보, 음원 DB를 기본 탑재하지 않습니다.
            교회가 보유하거나 권리자에게 사용 허가를 받은 텍스트와 자료만 입력해서 사용합니다.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              title: '성경 본문',
              body: '개역개정, 새번역 등은 대한성서공회 또는 권리자 허가 확인 후 사용합니다.',
            },
            {
              title: '찬송가',
              body: '새찬송가 가사/악보는 한국찬송가공회 등 권리자 허가 범위를 확인합니다.',
            },
            {
              title: '찬양곡',
              body: 'CCLI 번호, 권리자 허가번호, 교회 보유 자료 출처를 곡별로 기록합니다.',
            },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-[12px] font-bold text-gray-900">{item.title}</p>
              <p className="mt-1 text-[11px] leading-5 text-gray-500">{item.body}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-[13px] font-bold text-gray-900">라이선스 등록 준비</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="CCLI 또는 권리자 허가번호">
            <input
              disabled
              placeholder="다음 단계에서 교회별 라이선스 DB와 연결"
              className="w-full h-9 px-2.5 rounded-md border border-gray-300 bg-gray-50 text-[12px] text-gray-500"
            />
          </Field>
          <Field label="만료일">
            <input
              disabled
              type="date"
              className="w-full h-9 px-2.5 rounded-md border border-gray-300 bg-gray-50 text-[12px] text-gray-500"
            />
          </Field>
        </div>
        <p className="text-[11px] leading-5 text-gray-500">
          현재 단계에서는 안내와 수동 입력 흐름을 먼저 적용했습니다. 이후에는 교회별 허가번호,
          증빙파일, 사용 범위, 만료일을 저장하고 만료 시 송출/검색을 잠그는 구조로 확장합니다.
        </p>
      </Card>
    </>
  );
}

// ─────────────────────────────────────────
// 6. 회원 관리 (superadmin 전용)
// ─────────────────────────────────────────
interface ManagedUser {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: UserRole;
  profile_completed: boolean;
  created_at: string;
  last_sign_in_at: string | null;
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'member',     label: '회원' },
  { value: 'crew',       label: '대원' },
  { value: 'admin',      label: '관리자' },
  { value: 'superadmin', label: '슈퍼관리자' },
];

const ROLE_COLOR: Record<UserRole, string> = {
  member:     'bg-gray-100 text-gray-700 border-gray-200',
  crew:       'bg-sky-50 text-sky-700 border-sky-200',
  admin:      'bg-violet-50 text-violet-700 border-violet-200',
  superadmin: 'bg-amber-50 text-amber-800 border-amber-200',
};

function UserManagementSettings() {
  const { user: currentUser } = useAuthContext();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/users');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const { users: list } = await res.json();
      setUsers(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '사용자 목록을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleRoleChange = async (userId: string, newRole: UserRole, userName: string) => {
    setUpdating(userId);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      // 로컬 상태 반영
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
      setSuccessMsg(`${userName || userId}의 등급이 ${ROLE_LABEL[newRole]}(으)로 변경되었습니다`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '등급 변경에 실패했습니다');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-gray-400">사용자 목록 불러오는 중...</p>
        </div>
      </Card>
    );
  }

  return (
    <>
      {/* 상태 메시지 */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-[12px] text-red-700">
          {error}
          <button onClick={fetchUsers} className="ml-2 underline hover:text-red-900">다시 시도</button>
        </div>
      )}
      {successMsg && (
        <div className="mb-4 px-4 py-3 rounded-lg border border-emerald-200 bg-emerald-50 text-[12px] text-emerald-700">
          {successMsg}
        </div>
      )}

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[12px] font-bold text-gray-900">
            전체 회원 ({users.length}명)
          </h3>
          <button
            onClick={fetchUsers}
            className="px-2.5 h-7 rounded-md border border-gray-300 bg-white text-[11px] font-medium text-gray-600 hover:border-violet-400 hover:text-violet-700 transition-colors"
          >
            새로고침
          </button>
        </div>

        {/* 회원 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2.5 px-2 font-semibold text-gray-500 w-[30%]">이름 / 이메일</th>
                <th className="text-left py-2.5 px-2 font-semibold text-gray-500 w-[15%]">현재 등급</th>
                <th className="text-left py-2.5 px-2 font-semibold text-gray-500 w-[20%]">등급 변경</th>
                <th className="text-left py-2.5 px-2 font-semibold text-gray-500 w-[15%]">가입일</th>
                <th className="text-left py-2.5 px-2 font-semibold text-gray-500 w-[20%]">마지막 접속</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = u.id === currentUser?.id;
                const displayName = u.full_name || u.email?.split('@')[0] || '(이름 없음)';
                return (
                  <tr key={u.id} className={`border-b border-gray-100 ${isMe ? 'bg-violet-50/30' : 'hover:bg-gray-50'}`}>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                          {displayName[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">
                            {displayName}
                            {isMe && <span className="ml-1.5 text-[10px] text-violet-600">(나)</span>}
                          </p>
                          <p className="text-[10px] text-gray-400 truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${ROLE_COLOR[u.role]}`}>
                        {ROLE_LABEL[u.role]}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      {isMe ? (
                        <span className="text-[10px] text-gray-400">변경 불가</span>
                      ) : (
                        <select
                          value={u.role}
                          disabled={updating === u.id}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole, displayName)}
                          className="h-7 px-1.5 rounded-md border border-gray-300 bg-white text-[11px] text-gray-800 disabled:opacity-50 disabled:cursor-wait"
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="py-3 px-2 text-[11px] text-gray-500">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('ko-KR') : '-'}
                    </td>
                    <td className="py-3 px-2 text-[11px] text-gray-500">
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '없음'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {users.length === 0 && !error && (
          <div className="py-8 text-center text-[12px] text-gray-400">등록된 회원이 없습니다</div>
        )}
      </Card>

      {/* 등급 설명 카드 */}
      <Card>
        <h3 className="text-[12px] font-bold text-gray-900 mb-3">등급별 권한 안내</h3>
        <div className="space-y-2">
          {ROLE_OPTIONS.map((opt) => (
            <div key={opt.value} className="flex items-start gap-2.5">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold shrink-0 mt-0.5 ${ROLE_COLOR[opt.value]}`}>
                {opt.label}
              </span>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                {opt.value === 'member'     && '기본 등급. 워크스페이스 읽기 및 기본 기능만 사용할 수 있습니다.'}
                {opt.value === 'crew'       && '미디어부 활동 멤버. 프로그램 입력 및 협업 기능을 사용할 수 있습니다.'}
                {opt.value === 'admin'      && '관리자. 대시보드 접근, 설정 변경, 방송 제어가 가능합니다.'}
                {opt.value === 'superadmin' && '슈퍼관리자. 모든 권한을 가지며, 회원 등급을 관리할 수 있습니다.'}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
