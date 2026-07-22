export type ChurchSignupPlan = 'plus' | 'pro' | 'premium';

export type ChurchApplicationStatus =
  | 'submitted'
  | 'pending_subscription'
  | 'approved'
  | 'rejected';

export type ChurchWorkspaceStatus = 'pending' | 'active' | 'suspended' | 'archived';

export interface ChurchApplicationRow {
  id: string;
  applicant_user_id: string | null;
  church_id: string | null;
  church_name: string;
  desired_slug: string;
  senior_pastor: string | null;
  denomination: string | null;
  region: string | null;
  member_count: number | null;
  contact_name: string;
  contact_role: string | null;
  contact_email: string;
  contact_phone: string | null;
  plan_intent: ChurchSignupPlan;
  status: ChurchApplicationStatus;
  onboarding_note: string | null;
  copyright_terms_accepted?: boolean | null;
  copyright_terms_version?: string | null;
  copyright_terms_accepted_at?: string | null;
  copyright_terms_acceptance_ip?: string | null;
  copyright_terms_user_agent?: string | null;
  copyright_terms_snapshot?: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChurchWorkspaceRow {
  id: string;
  name: string;
  slug: string | null;
  senior_pastor: string | null;
  denomination: string | null;
  region: string | null;
  member_count: number | null;
  workspace_status: ChurchWorkspaceStatus | null;
  created_at: string;
  updated_at: string;
}

export interface ChurchMemberRow {
  id: string;
  church_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'crew' | 'member';
  status: 'active' | 'invited' | 'suspended';
  created_at: string;
  updated_at: string;
}

export const CHURCH_SIGNUP_PLAN_LABEL: Record<ChurchSignupPlan, string> = {
  plus: 'Plus',
  pro: 'Pro',
  premium: 'Premium',
};

export const CHURCH_APPLICATION_STATUS_LABEL: Record<ChurchApplicationStatus, string> = {
  submitted: '신청 접수',
  pending_subscription: '구독 확인 대기',
  approved: '승인 완료',
  rejected: '반려',
};

export interface ChurchSignupActionState {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
  workspaceUrl?: string;
  applicationId?: string;
}

export const initialChurchSignupState: ChurchSignupActionState = {
  ok: false,
  message: '',
};
