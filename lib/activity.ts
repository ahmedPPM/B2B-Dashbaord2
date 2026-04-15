import { supabaseAdmin } from './supabase/server';

export type ActivityAction = 'delete' | 'restore' | 'edit';

export async function logActivity(params: {
  leadId: string | null;
  action: ActivityAction;
  actor?: string | null;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  const supa = supabaseAdmin();
  const { error } = await supa.from('activity_log').insert({
    lead_id: params.leadId,
    action: params.action,
    actor: params.actor || null,
    before: params.before ?? null,
    after: params.after ?? null,
  });
  if (error) console.error('logActivity failed', error);
}
