'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

async function getAppUrl(): Promise<string> {
  const headerList = await headers();
  const origin = headerList.get('origin');
  const forwardedHost = headerList.get('x-forwarded-host');
  const host = forwardedHost || headerList.get('host');
  const forwardedProto = headerList.get('x-forwarded-proto');
  const protocol = forwardedProto || (process.env.NODE_ENV === 'development' ? 'http' : 'https');

  if (host) return `${protocol}://${host}`;
  if (origin) return origin;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return 'https://unoworship.kr';
}

export async function signInWithEmail(email: string, password: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { data: null, error: { message: error.message, code: error.code } };
  }

  revalidatePath('/', 'layout');
  return { data, error: null };
}

export async function signUpWithEmail(
  email: string,
  password: string,
  metadata?: Record<string, unknown>,
  redirectTo = '/signup/church'
) {
  const supabase = await createClient();
  const appUrl = await getAppUrl();
  const safeRedirectTo = redirectTo.startsWith('/') && !redirectTo.startsWith('//')
    ? redirectTo
    : '/signup/church';
  const confirmNext = `${safeRedirectTo}${safeRedirectTo.includes('?') ? '&' : '?'}verified=1`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appUrl}/auth/confirm?next=${encodeURIComponent(confirmNext)}`,
      data: {
        source: 'unolive',
        profile_completed: true,
        ...metadata,
      },
    },
  });

  if (error) {
    return { data: null, error: { message: error.message, code: error.code } };
  }

  revalidatePath('/', 'layout');
  return { data, error: null, emailConfirmationRequired: !data.session };
}

export async function signOut(scope: 'global' | 'local' | 'others' = 'local') {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope });

  if (error) return { error: { message: error.message } };

  revalidatePath('/', 'layout');
  return { error: null };
}

export async function signOutAndRedirect() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  revalidatePath('/', 'layout');
  redirect('/login');
}

export async function updateProfile(data: {
  full_name: string;
  phone: string;
}) {
  const supabase = await createClient();

  // 기존 role 유지 — 없으면 member (기본 등급)
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  const existingRole = currentUser?.user_metadata?.role ?? 'member';

  const { data: result, error } = await supabase.auth.updateUser({
    data: {
      full_name: data.full_name,
      phone: data.phone,
      profile_completed: true,
      role: existingRole,
    },
  });

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  revalidatePath('/', 'layout');
  return { data: result, error: null };
}

export async function resetPassword(email: string) {
  const supabase = await createClient();
  const appUrl = await getAppUrl();
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/reset-password`,
  });

  if (error) return { data: null, error: { message: error.message } };
  return { data, error: null };
}
