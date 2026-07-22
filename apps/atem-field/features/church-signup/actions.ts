'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import {
  CHURCH_SIGNUP_COPYRIGHT_CHECK_ITEMS,
  CHURCH_SIGNUP_COPYRIGHT_TERMS_TEXT,
  CHURCH_SIGNUP_COPYRIGHT_TERMS_VERSION,
} from './copyrightTerms';
import {
  getWorkspaceUrl,
  mapSignupPlanToSubscriptionPlan,
  validateChurchSignupForm,
} from './validation';
import { createChurchTrialPeriod } from './trialPeriod';
import type { ChurchApplicationRow, ChurchSignupActionState } from './types';

async function getCurrentSuperAdminId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  return profile?.role === 'superadmin' ? user.id : null;
}

async function isSlugTaken(slug: string): Promise<boolean> {
  const admin = createAdminClient();

  const { data: church, error: churchError } = await admin
    .from('churches')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (churchError && churchError.code !== 'PGRST116') {
    throw churchError;
  }
  if (church) return true;

  const { data: application, error: applicationError } = await admin
    .from('church_applications')
    .select('id')
    .eq('desired_slug', slug)
    .in('status', ['submitted', 'pending_subscription', 'approved'])
    .maybeSingle();

  if (applicationError && applicationError.code !== 'PGRST116') {
    throw applicationError;
  }
  return !!application;
}

function getClientIp(headerList: Headers): string | null {
  const forwarded = headerList.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headerList.get('x-real-ip') || null;
}

function createCopyrightConsentSnapshot(): string {
  return [
    `version: ${CHURCH_SIGNUP_COPYRIGHT_TERMS_VERSION}`,
    CHURCH_SIGNUP_COPYRIGHT_TERMS_TEXT,
    ...CHURCH_SIGNUP_COPYRIGHT_CHECK_ITEMS.map((item) => `- ${item}`),
  ].join('\n');
}

export async function submitChurchApplication(
  _prevState: ChurchSignupActionState,
  formData: FormData
): Promise<ChurchSignupActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || !user.email) {
    return {
      ok: false,
      message: '로그인 후 교회 워크스페이스를 신청할 수 있습니다.',
    };
  }

  const validated = validateChurchSignupForm(formData);
  if (!validated.ok) {
    return {
      ok: false,
      message: validated.message,
      fieldErrors: validated.fieldErrors,
    };
  }

  const input = validated.input;
  const contactEmail = user.email.toLowerCase();
  const headerList = await headers();
  const copyrightAcceptedAt = new Date().toISOString();
  const copyrightConsent = {
    copyright_terms_accepted: input.copyrightTermsAccepted,
    copyright_terms_version: CHURCH_SIGNUP_COPYRIGHT_TERMS_VERSION,
    copyright_terms_accepted_at: copyrightAcceptedAt,
    copyright_terms_acceptance_ip: getClientIp(headerList),
    copyright_terms_user_agent: headerList.get('user-agent'),
    copyright_terms_snapshot: createCopyrightConsentSnapshot(),
  };

  try {
    if (await isSlugTaken(input.desiredSlug)) {
      return {
        ok: false,
        message: '이미 사용 중이거나 승인 대기 중인 교회 주소입니다.',
        fieldErrors: { desiredSlug: '다른 주소를 입력해 주세요.' },
      };
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.id) {
      await admin
        .from('profiles')
        .update({
          full_name: input.contactName,
          phone: input.contactPhone,
          source: 'unolive',
        })
        .eq('id', user.id);
    } else {
      await admin
        .from('profiles')
        .insert({
          id: user.id,
          full_name: input.contactName,
          phone: input.contactPhone,
          role: 'member',
          source: 'unolive',
        });
    }

    const applicationPayload = {
      applicant_user_id: user.id,
      church_name: input.churchName,
      desired_slug: input.desiredSlug,
      senior_pastor: input.seniorPastor,
      denomination: input.denomination,
      region: input.region,
      member_count: input.memberCount,
      contact_name: input.contactName,
      contact_role: input.contactRole,
      contact_email: contactEmail,
      contact_phone: input.contactPhone,
      plan_intent: input.planIntent,
      status: 'submitted',
      onboarding_note: input.onboardingNote,
      ...copyrightConsent,
    };

    let { data: application, error: insertError } = await admin
      .from('church_applications')
      .insert(applicationPayload)
      .select('id')
      .single();

    if (insertError && (insertError.code === 'PGRST204' || /copyright_terms/i.test(insertError.message))) {
      const legacyNote = [
        input.onboardingNote,
        '',
        '[저작권 사용 책임 동의]',
        `동의시각: ${copyrightAcceptedAt}`,
        createCopyrightConsentSnapshot(),
      ].filter(Boolean).join('\n');

      const { data: legacyApplication, error: legacyInsertError } = await admin
        .from('church_applications')
        .insert({
          applicant_user_id: user.id,
          church_name: input.churchName,
          desired_slug: input.desiredSlug,
          senior_pastor: input.seniorPastor,
          denomination: input.denomination,
          region: input.region,
          member_count: input.memberCount,
          contact_name: input.contactName,
          contact_role: input.contactRole,
          contact_email: contactEmail,
          contact_phone: input.contactPhone,
          plan_intent: input.planIntent,
          status: 'submitted',
          onboarding_note: legacyNote,
        })
        .select('id')
        .single();

      application = legacyApplication;
      insertError = legacyInsertError;
    }

    if (insertError) {
      return {
        ok: false,
        message: `신청 저장에 실패했습니다. ${insertError.message}`,
      };
    }

    if (!application) {
      return {
        ok: false,
        message: '신청 저장 결과를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
      };
    }

    revalidatePath('/admin/church-applications');

    return {
      ok: true,
      message: '교회 워크스페이스 신청이 접수되었습니다. 승인되면 2개월 체험 기간과 함께 워크스페이스가 열립니다.',
      applicationId: application.id,
      workspaceUrl: getWorkspaceUrl(input.desiredSlug),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error
        ? `신청 처리 중 오류가 발생했습니다. ${error.message}`
        : '신청 처리 중 오류가 발생했습니다.',
    };
  }
}

export async function approveChurchApplication(formData: FormData) {
  const superAdminId = await getCurrentSuperAdminId();
  if (!superAdminId) {
    throw new Error('superadmin 권한이 필요합니다.');
  }

  const applicationId = String(formData.get('applicationId') || '');
  if (!applicationId) throw new Error('applicationId가 없습니다.');

  const admin = createAdminClient();
  const { data: application, error: applicationError } = await admin
    .from('church_applications')
    .select('*')
    .eq('id', applicationId)
    .single<ChurchApplicationRow>();

  if (applicationError || !application) {
    throw new Error(applicationError?.message || '신청 정보를 찾을 수 없습니다.');
  }

  if (application.status === 'approved') {
    revalidatePath('/admin/church-applications');
    return;
  }

  const { data: existingChurch } = await admin
    .from('churches')
    .select('id')
    .eq('slug', application.desired_slug)
    .maybeSingle();

  const churchPayload = {
    name: application.church_name,
    slug: application.desired_slug,
    senior_pastor: application.senior_pastor ?? '',
    denomination: application.denomination ?? '',
    region: application.region ?? '',
    member_count: application.member_count,
    workspace_status: 'active',
  };

  const churchResult = existingChurch
    ? await admin
        .from('churches')
        .update(churchPayload)
        .eq('id', existingChurch.id)
        .select('id')
        .single()
    : await admin
        .from('churches')
        .insert(churchPayload)
        .select('id')
        .single();

  if (churchResult.error || !churchResult.data) {
    throw new Error(churchResult.error?.message || '교회 워크스페이스 생성에 실패했습니다.');
  }

  const churchId = churchResult.data.id;
  const userId = application.applicant_user_id;
  const trialPeriod = createChurchTrialPeriod(new Date(application.created_at));
  if (userId) {
    await admin
      .from('profiles')
      .update({
        church_id: churchId,
        role: 'admin',
        full_name: application.contact_name,
        phone: application.contact_phone,
        source: 'unolive',
      })
      .eq('id', userId);

    await admin
      .from('church_members')
      .upsert({
        church_id: churchId,
        user_id: userId,
        role: 'owner',
        status: 'active',
      }, { onConflict: 'church_id,user_id' });

    await admin
      .from('subscriptions')
      .insert({
        user_id: userId,
        church_id: churchId,
        plan: mapSignupPlanToSubscriptionPlan(application.plan_intent),
        status: 'trial',
        started_at: trialPeriod.startsAt,
        trial_ends_at: trialPeriod.endsAt,
        expires_at: trialPeriod.endsAt,
        payment_provider: 'manual',
        metadata: {
          source: 'church_application',
          application_id: application.id,
          approved_by: superAdminId,
          plan_intent: application.plan_intent,
          trial_months: trialPeriod.months,
        },
      });
  }

  const { error: updateError } = await admin
    .from('church_applications')
    .update({
      status: 'approved',
      approved_by: superAdminId,
      approved_at: new Date().toISOString(),
      church_id: churchId,
      rejected_reason: null,
    })
    .eq('id', applicationId);

  if (updateError) throw new Error(updateError.message);

  revalidatePath('/admin/church-applications');
  revalidatePath(`/@${application.desired_slug}`);
}

export async function rejectChurchApplication(formData: FormData) {
  const superAdminId = await getCurrentSuperAdminId();
  if (!superAdminId) {
    throw new Error('superadmin 권한이 필요합니다.');
  }

  const applicationId = String(formData.get('applicationId') || '');
  const rejectedReason = String(formData.get('rejectedReason') || '').trim() || '요건 확인 필요';
  if (!applicationId) throw new Error('applicationId가 없습니다.');

  const admin = createAdminClient();
  const { error } = await admin
    .from('church_applications')
    .update({
      status: 'rejected',
      approved_by: superAdminId,
      rejected_reason: rejectedReason,
    })
    .eq('id', applicationId);

  if (error) throw new Error(error.message);
  revalidatePath('/admin/church-applications');
}
