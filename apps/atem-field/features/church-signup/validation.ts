import type { ChurchSignupPlan } from './types';

const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'auth',
  'canvas',
  'cameras-source',
  'company',
  'composer',
  'complete-profile',
  'forgot-password',
  'login',
  'media',
  'output',
  'pricing',
  'product',
  'prompt',
  'resources',
  'signup',
]);

const PLAN_VALUES = new Set<ChurchSignupPlan>(['plus', 'pro', 'premium']);

export interface ChurchSignupInput {
  churchName: string;
  desiredSlug: string;
  seniorPastor: string | null;
  denomination: string | null;
  region: string | null;
  memberCount: number | null;
  contactName: string;
  contactRole: string | null;
  contactPhone: string | null;
  planIntent: ChurchSignupPlan;
  onboardingNote: string | null;
  copyrightTermsAccepted: boolean;
}

function stringValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeChurchSlug(value: string): string {
  return value
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function getWorkspaceUrl(slug: string): string {
  const base = process.env.NEXT_PUBLIC_WORKSPACE_APP_URL || 'https://app.unoworship.kr';
  return `${base.replace(/\/$/, '')}/@${slug}`;
}

export function isReservedChurchSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

export function validateChurchSignupForm(formData: FormData):
  | { ok: true; input: ChurchSignupInput }
  | { ok: false; fieldErrors: Record<string, string>; message: string } {
  const fieldErrors: Record<string, string> = {};

  const churchName = stringValue(formData, 'churchName');
  const desiredSlug = normalizeChurchSlug(stringValue(formData, 'desiredSlug'));
  const seniorPastor = stringValue(formData, 'seniorPastor') || null;
  const denomination = stringValue(formData, 'denomination') || null;
  const region = stringValue(formData, 'region') || null;
  const rawMemberCount = stringValue(formData, 'memberCount');
  const contactName = stringValue(formData, 'contactName');
  const contactRole = stringValue(formData, 'contactRole') || null;
  const contactPhone = stringValue(formData, 'contactPhone') || null;
  const planIntent = stringValue(formData, 'planIntent') as ChurchSignupPlan;
  const onboardingNote = stringValue(formData, 'onboardingNote') || null;
  const copyrightTermsAccepted = formData.get('copyrightTermsAccepted') === 'on';

  if (churchName.length < 2) fieldErrors.churchName = '교회명을 2자 이상 입력해 주세요.';
  if (!desiredSlug) fieldErrors.desiredSlug = '희망 주소를 입력해 주세요.';
  if (desiredSlug && desiredSlug.length < 3) fieldErrors.desiredSlug = '희망 주소는 3자 이상이어야 합니다.';
  if (desiredSlug && isReservedChurchSlug(desiredSlug)) fieldErrors.desiredSlug = '시스템에서 사용하는 주소라 신청할 수 없습니다.';
  if (!contactName) fieldErrors.contactName = '담당자명을 입력해 주세요.';
  if (!PLAN_VALUES.has(planIntent)) fieldErrors.planIntent = '요금제를 선택해 주세요.';
  if (!copyrightTermsAccepted) {
    fieldErrors.copyrightTermsAccepted = '저작권 사용 책임 확인에 동의해야 체험/구독 신청을 접수할 수 있습니다.';
  }

  let memberCount: number | null = null;
  if (rawMemberCount) {
    const parsed = Number(rawMemberCount);
    if (!Number.isFinite(parsed) || parsed < 0) {
      fieldErrors.memberCount = '교인 수는 0 이상의 숫자로 입력해 주세요.';
    } else {
      memberCount = Math.floor(parsed);
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
      message: '입력 내용을 다시 확인해 주세요.',
    };
  }

  return {
    ok: true,
    input: {
      churchName,
      desiredSlug,
      seniorPastor,
      denomination,
      region,
      memberCount,
      contactName,
      contactRole,
      contactPhone,
      planIntent,
      onboardingNote,
      copyrightTermsAccepted,
    },
  };
}

export function mapSignupPlanToSubscriptionPlan(plan: ChurchSignupPlan): 'church_basic' | 'church_pro' {
  return plan === 'plus' ? 'church_basic' : 'church_pro';
}
