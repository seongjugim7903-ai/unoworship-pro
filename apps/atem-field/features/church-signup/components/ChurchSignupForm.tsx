'use client';

import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2 } from 'lucide-react';
import CopyrightComplianceNotice from '@/components/compliance/CopyrightComplianceNotice';
import { submitChurchApplication } from '../actions';
import {
  CHURCH_SIGNUP_COPYRIGHT_CHECK_ITEMS,
  CHURCH_SIGNUP_COPYRIGHT_TERMS_VERSION,
} from '../copyrightTerms';
import {
  CHURCH_SIGNUP_PLAN_LABEL,
  initialChurchSignupState,
  type ChurchSignupPlan,
} from '../types';
import { createChurchTrialPeriod, formatTrialPeriod } from '../trialPeriod';
import { normalizeChurchSlug } from '../validation';

const plans = [
  { value: 'plus', detail: '확장 모니터 기반 자막 송출, 중소형 교회 기본 운영' },
  { value: 'pro', detail: '향후 ATEM/SDI 연동을 고려한 고급 운영 준비' },
  { value: 'premium', detail: '대형 예배당, 기관 행사, 다중 출력 확장 계획' },
] as const;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-semibold text-red-600">{message}</p>;
}

interface ChurchSignupFormProps {
  initialPlan?: ChurchSignupPlan;
  lockPlan?: boolean;
  currentUserEmail: string;
}

export function ChurchSignupForm({ initialPlan = 'plus', lockPlan = false, currentUserEmail }: ChurchSignupFormProps) {
  const [state, formAction, isPending] = useActionState(submitChurchApplication, initialChurchSignupState);
  const [slugValue, setSlugValue] = useState('');
  const previewSlug = useMemo(() => normalizeChurchSlug(slugValue), [slugValue]);
  const trialPeriod = useMemo(() => createChurchTrialPeriod(), []);

  if (state.ok) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-emerald-950">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
          <div>
            <h2 className="text-xl font-black">신청이 접수되었습니다</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-800">{state.message}</p>
            {state.workspaceUrl && (
              <p className="mt-4 rounded-md bg-white px-3 py-2 text-sm font-black text-slate-900">
                예정 주소: {state.workspaceUrl}
              </p>
            )}
            <Link
              href="/media"
              className="mt-5 inline-flex h-10 items-center rounded-md bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800"
            >
              운영 대시보드로 이동
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="churchName" className="text-sm font-black text-slate-800">교회명</label>
          <input
            id="churchName"
            name="churchName"
            required
            className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none focus:border-teal-600"
            placeholder="울주교회"
          />
          <FieldError message={state.fieldErrors?.churchName} />
        </div>
        <div>
          <label htmlFor="desiredSlug" className="text-sm font-black text-slate-800">희망 워크스페이스 주소</label>
          <div className="mt-1 flex h-11 overflow-hidden rounded-md border border-slate-300 focus-within:border-teal-600">
            <span className="inline-flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-500">
              app.unoworship.kr/@
            </span>
            <input
              id="desiredSlug"
              name="desiredSlug"
              value={slugValue}
              onChange={(event) => setSlugValue(event.target.value)}
              required
              className="min-w-0 flex-1 px-3 text-sm text-slate-950 outline-none"
              placeholder="ulju"
            />
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {previewSlug ? `미리보기: app.unoworship.kr/@${previewSlug}` : '영문 소문자, 숫자, 하이픈 사용'}
          </p>
          <FieldError message={state.fieldErrors?.desiredSlug} />
        </div>
        <div>
          <label htmlFor="seniorPastor" className="text-sm font-black text-slate-800">담임목사</label>
          <input id="seniorPastor" name="seniorPastor" className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none focus:border-teal-600" />
        </div>
        <div>
          <label htmlFor="denomination" className="text-sm font-black text-slate-800">교단</label>
          <input id="denomination" name="denomination" className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none focus:border-teal-600" />
        </div>
        <div>
          <label htmlFor="region" className="text-sm font-black text-slate-800">지역</label>
          <input id="region" name="region" className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none focus:border-teal-600" placeholder="울산 울주군" />
        </div>
        <div>
          <label htmlFor="memberCount" className="text-sm font-black text-slate-800">교인 수</label>
          <input id="memberCount" name="memberCount" type="number" min="0" className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none focus:border-teal-600" />
          <FieldError message={state.fieldErrors?.memberCount} />
        </div>
        <div>
          <label htmlFor="contactName" className="text-sm font-black text-slate-800">담당자명</label>
          <input id="contactName" name="contactName" required className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none focus:border-teal-600" />
          <FieldError message={state.fieldErrors?.contactName} />
        </div>
        <div>
          <label htmlFor="contactRole" className="text-sm font-black text-slate-800">담당 역할</label>
          <input id="contactRole" name="contactRole" className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none focus:border-teal-600" placeholder="방송팀장, 미디어 담당자" />
        </div>
        <div>
          <label htmlFor="contactPhone" className="text-sm font-black text-slate-800">연락처</label>
          <input id="contactPhone" name="contactPhone" className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none focus:border-teal-600" />
        </div>
        <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-black text-slate-500">로그인 계정</div>
          <div className="mt-1 text-sm font-black text-slate-950">{currentUserEmail}</div>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            교회 신청은 현재 로그인된 계정으로 접수됩니다.
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div className="text-sm font-black text-slate-800">신청 구독등급</div>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          {plans.map((plan) => {
            const isSelected = plan.value === initialPlan;
            const isUnavailable = lockPlan && !isSelected;

            return (
              <label
                key={plan.value}
                aria-disabled={isUnavailable}
                className={[
                  'rounded-lg border p-4 transition',
                  isUnavailable
                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 opacity-55 grayscale'
                    : 'cursor-pointer border-slate-200 hover:border-teal-500 has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50',
                ].join(' ')}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="planIntent"
                  value={plan.value}
                  defaultChecked={isSelected}
                  disabled={isUnavailable}
                />
                <span className={['block text-sm font-black', isUnavailable ? 'text-slate-500' : 'text-slate-950'].join(' ')}>
                  {CHURCH_SIGNUP_PLAN_LABEL[plan.value]}
                </span>
                <span className={['mt-1 block text-xs leading-5', isUnavailable ? 'text-slate-400' : 'text-slate-600'].join(' ')}>
                  {plan.detail}
                </span>
              </label>
            );
          })}
        </div>
        <FieldError message={state.fieldErrors?.planIntent} />
      </div>

      <div className="mt-5">
        <label htmlFor="onboardingNote" className="text-sm font-black text-slate-800">도입 상황 메모</label>
        <textarea
          id="onboardingNote"
          name="onboardingNote"
          rows={4}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-teal-600"
          placeholder="예: 토요일 시연 예정, 강대상 모니터/프롬프트 모니터 구성, 기존 장비 상황 등"
        />
      </div>

      {state.message && !state.ok && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {state.message}
        </div>
      )}

      <div className="mt-5 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3">
        <div className="text-sm font-black text-teal-900">2개월 무료 체험 기간</div>
        <div className="mt-1 text-sm font-semibold leading-6 text-teal-800">
          신청 작성일 기준 {formatTrialPeriod(trialPeriod)}까지 체험으로 이용할 수 있습니다.
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <CopyrightComplianceNotice compact className="border-amber-300 bg-white/70" />
        <div className="mt-3 rounded-md border border-amber-200 bg-white px-3 py-3">
          <div className="text-xs font-black uppercase tracking-wider text-amber-700">
            체험/구독 신청 필수 확인
          </div>
          <ul className="mt-2 space-y-1.5 text-xs font-semibold leading-5 text-amber-950">
            {CHURCH_SIGNUP_COPYRIGHT_CHECK_ITEMS.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-0.5 text-amber-600">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-amber-300 bg-amber-100/60 px-3 py-3">
            <input
              type="checkbox"
              name="copyrightTermsAccepted"
              required
              className="mt-1 h-4 w-4 rounded border-amber-500 accent-slate-950"
            />
            <span className="text-sm font-black leading-6 text-amber-950">
              위 저작권 사용 책임 안내를 확인했으며, 교회가 보유하거나 사용 허가를 받은 자료만
              UnoWorship에 입력·업로드·송출하는 것에 동의합니다.
              <span className="mt-1 block text-[11px] font-bold text-amber-700">
                동의 버전: {CHURCH_SIGNUP_COPYRIGHT_TERMS_VERSION}
              </span>
            </span>
          </label>
          <FieldError message={state.fieldErrors?.copyrightTermsAccepted} />
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-5 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        교회 워크스페이스 신청
      </button>
    </form>
  );
}
