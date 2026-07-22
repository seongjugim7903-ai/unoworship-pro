import { approveChurchApplication, rejectChurchApplication } from '../actions';
import {
  CHURCH_APPLICATION_STATUS_LABEL,
  CHURCH_SIGNUP_PLAN_LABEL,
  type ChurchApplicationRow,
} from '../types';
import { getWorkspaceUrl } from '../validation';

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusClass(status: ChurchApplicationRow['status']) {
  if (status === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'rejected') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'pending_subscription') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-sky-200 bg-sky-50 text-sky-700';
}

function consentLabel(row: ChurchApplicationRow) {
  if (row.copyright_terms_accepted) {
    return row.copyright_terms_accepted_at
      ? `동의 완료 · ${formatDate(row.copyright_terms_accepted_at)}`
      : '동의 완료';
  }
  return row.onboarding_note?.includes('[저작권 사용 책임 동의]') ? '동의 완료 · 구버전 기록' : '확인 필요';
}

export function ChurchApplicationAdminPanel({ rows }: { rows: ChurchApplicationRow[] }) {
  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">
          아직 접수된 교회 신청이 없습니다.
        </div>
      ) : (
        rows.map((row) => (
          <article key={row.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black text-slate-950">{row.church_name}</h2>
                  <span className={`rounded-full border px-2 py-1 text-xs font-black ${statusClass(row.status)}`}>
                    {CHURCH_APPLICATION_STATUS_LABEL[row.status]}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-black text-slate-600">
                    {CHURCH_SIGNUP_PLAN_LABEL[row.plan_intent]}
                  </span>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {getWorkspaceUrl(row.desired_slug)}
                </p>
              </div>
              <p className="text-xs font-bold text-slate-400">접수 {formatDate(row.created_at)}</p>
            </div>

            <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
              <Info label="담당자" value={`${row.contact_name}${row.contact_role ? ` / ${row.contact_role}` : ''}`} />
              <Info label="이메일" value={row.contact_email} />
              <Info label="연락처" value={row.contact_phone || '-'} />
              <Info label="담임목사" value={row.senior_pastor || '-'} />
              <Info label="교단/지역" value={[row.denomination, row.region].filter(Boolean).join(' / ') || '-'} />
              <Info label="교인 수" value={row.member_count == null ? '-' : `${row.member_count.toLocaleString('ko-KR')}명`} />
              <Info label="저작권 책임 동의" value={consentLabel(row)} />
            </div>

            {row.onboarding_note && (
              <div className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                {row.onboarding_note}
              </div>
            )}

            {row.status !== 'approved' && (
              <div className="mt-5 flex flex-wrap gap-3">
                <form action={approveChurchApplication}>
                  <input type="hidden" name="applicationId" value={row.id} />
                  <button className="h-10 rounded-md bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800">
                    구독 승인 및 워크스페이스 생성
                  </button>
                </form>
                {row.status !== 'rejected' && (
                  <form action={rejectChurchApplication} className="flex flex-wrap gap-2">
                    <input type="hidden" name="applicationId" value={row.id} />
                    <input
                      name="rejectedReason"
                      className="h-10 min-w-56 rounded-md border border-slate-300 px-3 text-sm text-slate-900"
                      placeholder="반려 사유"
                    />
                    <button className="h-10 rounded-md border border-red-200 px-4 text-sm font-black text-red-700 hover:bg-red-50">
                      반려
                    </button>
                  </form>
                )}
              </div>
            )}
          </article>
        ))
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs font-black text-slate-500">{label}</div>
      <div className="mt-1 font-bold text-slate-900">{value}</div>
    </div>
  );
}
