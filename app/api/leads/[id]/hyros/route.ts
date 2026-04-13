import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supa = supabaseAdmin();
  const { data: lead } = await supa.from('leads').select('email').eq('id', id).maybeSingle();
  if (!lead?.email) return NextResponse.json({ ok: true, hyros: null });
  const { data: hyros } = await supa
    .from('hyros_attribution')
    .select('*')
    .eq('email', lead.email.trim().toLowerCase())
    .maybeSingle();
  return NextResponse.json({ ok: true, hyros: hyros || null });
}
