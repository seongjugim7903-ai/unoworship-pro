import { createAdminClient, createClient } from '@/lib/supabase/server';
import { normalizeChurchSlug } from './validation';
import { getPaymentRedirectUrl, getSubscriptionAccessState } from './trialPeriod';
import type {
  ChurchApplicationRow,
  ChurchMemberRow,
  ChurchWorkspaceRow,
} from './types';
import type { Subscription } from '@/lib/supabase/profileTypes';

export type AdminApplicationsResult =
  | { status: 'ok'; rows: ChurchApplicationRow[] }
  | { status: 'unauthenticated' }
  | { status: 'forbidden' }
  | { status: 'setup_required'; message: string };

export async function getAdminChurchApplications(): Promise<AdminApplicationsResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'unauthenticated' };

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return { status: 'setup_required', message: profileError.message };
  }
  if (profile?.role !== 'superadmin') {
    return { status: 'forbidden' };
  }

  const { data, error } = await admin
    .from('church_applications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return { status: 'setup_required', message: error.message };
  }

  return { status: 'ok', rows: (data ?? []) as ChurchApplicationRow[] };
}

export type ChurchWorkspaceAccess =
  | { status: 'invalid_slug' }
  | { status: 'not_found'; slug: string }
  | { status: 'unauthenticated'; slug: string }
  | { status: 'not_member'; slug: string; church: ChurchWorkspaceRow }
  | { status: 'subscription_required'; slug: string; church: ChurchWorkspaceRow }
  | { status: 'payment_required'; slug: string; church: ChurchWorkspaceRow; paymentUrl: string }
  | { status: 'setup_required'; slug: string; message: string }
  | {
      status: 'ok';
      slug: string;
      church: ChurchWorkspaceRow;
      membership: ChurchMemberRow | null;
      subscription: Subscription | null;
    };

export async function getChurchWorkspaceAccess(workspaceSlug: string): Promise<ChurchWorkspaceAccess> {
  if (!workspaceSlug.startsWith('@')) {
    return { status: 'invalid_slug' };
  }

  const slug = normalizeChurchSlug(workspaceSlug);
  if (!slug || `@${slug}` !== workspaceSlug.toLowerCase()) {
    return { status: 'invalid_slug' };
  }

  const admin = createAdminClient();
  const { data: church, error: churchError } = await admin
    .from('churches')
    .select('id, name, slug, senior_pastor, denomination, region, member_count, workspace_status, created_at, updated_at')
    .eq('slug', slug)
    .eq('workspace_status', 'active')
    .maybeSingle();

  if (churchError) {
    return { status: 'setup_required', slug, message: churchError.message };
  }
  if (!church) {
    return { status: 'not_found', slug };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { status: 'unauthenticated', slug };
  }

  const { data: membership, error: membershipError } = await admin
    .from('church_members')
    .select('*')
    .eq('church_id', church.id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (membershipError) {
    return { status: 'setup_required', slug, message: membershipError.message };
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('church_id')
    .eq('id', user.id)
    .maybeSingle();

  const isMember = !!membership || profile?.church_id === church.id;
  if (!isMember) {
    return { status: 'not_member', slug, church: church as ChurchWorkspaceRow };
  }

  const { data: subscription, error: subscriptionError } = await admin
    .from('subscriptions')
    .select('*')
    .eq('church_id', church.id)
    .in('status', ['active', 'trial'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionError) {
    return { status: 'setup_required', slug, message: subscriptionError.message };
  }

  const subscriptionState = getSubscriptionAccessState(subscription as Subscription | null);
  if (subscriptionState.status === 'missing') {
    return { status: 'subscription_required', slug, church: church as ChurchWorkspaceRow };
  }
  if (subscriptionState.status === 'trial_expired' || subscriptionState.status === 'expired') {
    return {
      status: 'payment_required',
      slug,
      church: church as ChurchWorkspaceRow,
      paymentUrl: getPaymentRedirectUrl(slug, 'trial-expired'),
    };
  }

  return {
    status: 'ok',
    slug,
    church: church as ChurchWorkspaceRow,
    membership: membership as ChurchMemberRow | null,
    subscription: subscription as Subscription | null,
  };
}
