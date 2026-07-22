import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  let next = searchParams.get('next') ?? '/';

  if (!next.startsWith('/') || next.startsWith('//')) next = '/';

  const nextUrl = new URL(next, request.url);

  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = nextUrl.pathname;
  redirectTo.search = nextUrl.search;

  if (!token_hash || !type) {
    redirectTo.pathname = '/login';
    redirectTo.searchParams.set('error', 'missing_token');
    return NextResponse.redirect(redirectTo);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    redirectTo.pathname = '/login';
    redirectTo.searchParams.set('error', error.message);
    return NextResponse.redirect(redirectTo);
  }

  redirectTo.searchParams.delete('next');
  return NextResponse.redirect(redirectTo);
}
