import { supabaseAdmin } from './supabase/server';

interface PipelineStage {
  id: string;
  name: string;
  position: number;
}
interface Pipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
}

let cache: { at: number; map: Map<string, { stageName: string; pipelineName: string; position: number }> } | null = null;
const TTL_MS = 15 * 60 * 1000;

export async function getStageMap() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  const res = await fetch(
    `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${process.env.GHL_LOCATION_ID}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GHL_API_KEY}`,
        Version: '2021-07-28',
        Accept: 'application/json',
      },
    }
  );
  if (!res.ok) throw new Error(`pipelines fetch ${res.status}`);
  const body = (await res.json()) as { pipelines: Pipeline[] };
  const map = new Map<string, { stageName: string; pipelineName: string; position: number }>();
  for (const p of body.pipelines || []) {
    for (const s of p.stages || []) {
      map.set(s.id, { stageName: s.name, pipelineName: p.name, position: s.position });
    }
  }
  cache = { at: Date.now(), map };
  return map;
}

export async function resolveStage(stageId: string | null | undefined) {
  if (!stageId) return null;
  const map = await getStageMap();
  return map.get(stageId) || null;
}

export async function annotateLeads<T extends { pipeline_stage?: string | null }>(leads: T[]): Promise<(T & { stage_name?: string; pipeline_name?: string })[]> {
  const map = await getStageMap();
  return leads.map((l) => {
    const hit = l.pipeline_stage ? map.get(l.pipeline_stage) : null;
    return { ...l, stage_name: hit?.stageName, pipeline_name: hit?.pipelineName };
  });
}

/**
 * Backfill pipeline_stage for all existing leads by re-fetching their opportunity.
 */
export async function backfillPipelineStages() {
  const { ghl } = await import('./ghl');
  const supa = supabaseAdmin();
  const { data: leads } = await supa.from('leads').select('id, ghl_contact_id');
  let updated = 0;
  for (const l of leads || []) {
    try {
      const { opportunities } = await ghl.getOpportunityByContact(l.ghl_contact_id);
      const open = (opportunities || [])[0];
      if (!open?.pipelineStageId) continue;
      await supa
        .from('leads')
        .update({
          pipeline_stage: open.pipelineStageId,
          cash_collected: open.monetaryValue || 0,
        })
        .eq('id', l.id);
      updated++;
      await ghl.sleep(40);
    } catch (e) {
      console.error('backfillPipelineStages', l.ghl_contact_id, e);
    }
  }
  return updated;
}
