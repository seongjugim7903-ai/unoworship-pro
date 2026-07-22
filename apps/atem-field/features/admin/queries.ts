import { createAdminClient, createClient } from '@/lib/supabase/server';

type AdminResultBase =
  | { status: 'unauthenticated' }
  | { status: 'forbidden' }
  | { status: 'setup_required'; message: string };

interface AdminProfileRow {
  id: string;
  full_name: string | null;
  role: string;
  church_id: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

interface AdminChurchRow {
  id: string;
  name: string;
  slug: string | null;
}

export interface AdminUserRow {
  id: string;
  email: string;
  emailConfirmed: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  fullName: string | null;
  role: string;
  source: string | null;
  churchName: string | null;
  churchSlug: string | null;
}

export type AdminUsersResult =
  | AdminResultBase
  | {
      status: 'ok';
      rows: AdminUserRow[];
      totalUsers: number;
      simpleUsers: number;
    };

export type AdminSettingsResult =
  | AdminResultBase
  | {
      status: 'ok';
      ownerEmail: string;
      ownerName: string;
      ownerRole: string;
      churchScoped: boolean;
    };

async function ensureSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || !user.email) return { status: 'unauthenticated' as const };

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, full_name, role, church_id, source, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle();

  if (error) return { status: 'setup_required' as const, message: error.message };
  if (profile?.role !== 'superadmin') return { status: 'forbidden' as const };

  return {
    status: 'ok' as const,
    user,
    profile: profile as AdminProfileRow,
    admin,
  };
}

export async function getAdminSimpleUsers(): Promise<AdminUsersResult> {
  const access = await ensureSuperAdmin();
  if (access.status !== 'ok') return access;

  const { data: listData, error: listError } = await access.admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (listError) return { status: 'setup_required', message: listError.message };

  const { data: profiles, error: profileError } = await access.admin
    .from('profiles')
    .select('id, full_name, role, church_id, source, created_at, updated_at');

  if (profileError) return { status: 'setup_required', message: profileError.message };

  const churchIds = Array.from(new Set((profiles ?? []).map((profile) => profile.church_id).filter(Boolean))) as string[];
  const churchesById = new Map<string, AdminChurchRow>();

  if (churchIds.length > 0) {
    const { data: churches, error: churchError } = await access.admin
      .from('churches')
      .select('id, name, slug')
      .in('id', churchIds);

    if (churchError) return { status: 'setup_required', message: churchError.message };
    (churches ?? []).forEach((church) => churchesById.set(church.id, church as AdminChurchRow));
  }

  const profilesById = new Map<string, AdminProfileRow>();
  (profiles ?? []).forEach((profile) => profilesById.set(profile.id, profile as AdminProfileRow));

  const rows = listData.users
    .map((user) => {
      const profile = profilesById.get(user.id);
      const church = profile?.church_id ? churchesById.get(profile.church_id) : null;

      return {
        id: user.id,
        email: user.email ?? '-',
        emailConfirmed: !!user.email_confirmed_at,
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
        fullName: profile?.full_name ?? null,
        role: profile?.role ?? 'member',
        source: profile?.source ?? null,
        churchName: church?.name ?? null,
        churchSlug: church?.slug ?? null,
      };
    })
    .filter((row) => row.role === 'member' && !row.churchName)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    status: 'ok',
    rows,
    totalUsers: listData.users.length,
    simpleUsers: rows.length,
  };
}

export async function getAdminSettings(): Promise<AdminSettingsResult> {
  const access = await ensureSuperAdmin();
  if (access.status !== 'ok') return access;

  return {
    status: 'ok',
    ownerEmail: access.user.email ?? '',
    ownerName: access.profile.full_name ?? access.user.email ?? '관리자',
    ownerRole: access.profile.role,
    churchScoped: !!access.profile.church_id,
  };
}
