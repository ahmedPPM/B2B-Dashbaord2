import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const leadId = url.searchParams.get('leadId');
  if (!leadId) {
    return NextResponse.json({ ok: false, error: 'leadId required' }, { status: 400 });
  }

  const supa = supabaseAdmin();
  try {
    const { data, error } = await supa
      .from('lead_comments')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      // Table might not exist yet
      console.error('lead_comments GET error:', error.message);
      return NextResponse.json({ ok: true, comments: [] });
    }
    return NextResponse.json({ ok: true, comments: data || [] });
  } catch (err) {
    console.error('lead_comments GET catch:', err);
    return NextResponse.json({ ok: true, comments: [] });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { lead_id, text, author } = body as { lead_id?: string; text?: string; author?: string };

  if (!lead_id || !text) {
    return NextResponse.json({ ok: false, error: 'lead_id and text required' }, { status: 400 });
  }

  const supa = supabaseAdmin();
  try {
    const { data, error } = await supa
      .from('lead_comments')
      .insert({ lead_id, text, author: author || 'Anas' })
      .select()
      .single();

    if (error) {
      console.error('lead_comments POST error:', error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, comment: data });
  } catch (err) {
    console.error('lead_comments POST catch:', err);
    return NextResponse.json({ ok: false, error: 'Failed to save comment' }, { status: 500 });
  }
}
