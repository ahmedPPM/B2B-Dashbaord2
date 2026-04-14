import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { typeform, TypeformClient } from '@/lib/typeform';

export async function POST() {
  const supa = supabaseAdmin();
  const forms = await typeform.listForms();

  // Build email -> utms map (prefer the most recent submission if a lead filled
  // multiple forms, pick the one with the most fields populated).
  const byEmail = new Map<
    string,
    {
      utm_source?: string;
      utm_campaign?: string;
      utm_content?: string;
      utm_medium?: string;
      utm_term?: string;
      ad_id?: string;
      campaign_id?: string;
      form_id: string;
      form_title: string;
      submitted_at?: string;
    }
  >();

  let scanned = 0;
  const formsStats: Array<{ id: string; title: string; responses: number; withEmail: number }> = [];

  for (const f of forms) {
    try {
      const responses = await typeform.listResponses(f.id);
      let withEmail = 0;
      for (const r of responses) {
        scanned++;
        const ex = TypeformClient.extract(r);
        if (!ex) continue;
        withEmail++;
        const existing = byEmail.get(ex.email);
        const hasUtm = !!(ex.utm_source || ex.utm_campaign || ex.utm_content);
        // Prefer entries with UTMs over ones without; prefer newer submissions.
        if (
          !existing ||
          (hasUtm && !(existing.utm_source || existing.utm_campaign)) ||
          (ex.submitted_at &&
            existing.submitted_at &&
            ex.submitted_at > existing.submitted_at &&
            hasUtm)
        ) {
          byEmail.set(ex.email, { ...ex, form_id: f.id, form_title: f.title });
        }
      }
      formsStats.push({ id: f.id, title: f.title, responses: responses.length, withEmail });
    } catch (e) {
      console.error('typeform form failed', f.id, e);
    }
  }

  // Match against leads and patch.
  const emails = Array.from(byEmail.keys());
  const { data: leads } = await supa.from('leads').select('id, email').in('email', emails);
  let updated = 0;
  let noUtms = 0;

  for (const l of leads || []) {
    const email = (l.email || '').toLowerCase();
    const ex = byEmail.get(email);
    if (!ex) continue;
    const patch: Record<string, unknown> = {};
    if (ex.utm_source) patch.lead_source = ex.utm_source;
    if (ex.utm_campaign) patch.campaign_name = ex.utm_campaign;
    if (ex.utm_content) patch.ad_name = ex.utm_content;
    if (ex.utm_medium) patch.ad_set_name = ex.utm_medium;
    if (ex.campaign_id) patch.campaign_id = ex.campaign_id;
    if (ex.ad_id) patch.ad_id = ex.ad_id;
    if (Object.keys(patch).length === 0) {
      noUtms++;
      continue;
    }
    await supa.from('leads').update(patch).eq('id', l.id);
    updated++;
  }

  return NextResponse.json({
    ok: true,
    forms_scanned: forms.length,
    responses_scanned: scanned,
    matched_emails: leads?.length || 0,
    updated,
    noUtms,
    formsStats,
  });
}
