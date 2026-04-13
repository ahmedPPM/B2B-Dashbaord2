export interface Lead {
  id: string;
  ghl_contact_id: string;
  date_opted_in: string | null;
  lead_name: string | null;
  phone: string | null;
  email: string | null;
  app_grading: 1 | 2 | 3 | 4 | null;
  campaign_id: string | null;
  ad_set_id: string | null;
  ad_id: string | null;
  campaign_name: string | null;
  ad_set_name: string | null;
  ad_name: string | null;
  dials_per_lead: number;
  speed_to_lead_minutes: number | null;
  lead_source: string | null;
  pipeline_stage: string | null;
  intro_booked: boolean;
  intro_created_date: string | null;
  intro_booked_for_date: string | null;
  intro_show_status: string | null;
  intro_converted_to_demo: boolean;
  intro_call_outcome: string | null;
  intro_closer: string | null;
  demo_booked: boolean;
  demo_created_date: string | null;
  demo_booked_for_date: string | null;
  demo_show_status: string | null;
  demo_call_outcome: string | null;
  why_didnt_close: string | null;
  demo_assigned_closer: string | null;
  offer_pitched: boolean;
  client_closed: boolean;
  cash_collected: number;
  contracted_mrr: number;
  lead_tag: string | null;
  backfilled: boolean;
  created_at: string;
  updated_at: string;
}

export interface PipelineEvent {
  id: string;
  lead_id: string;
  ghl_contact_id: string;
  from_stage: string | null;
  to_stage: string | null;
  changed_at: string;
  source: string | null;
}

export interface CallAnalysis {
  id: string;
  lead_id: string | null;
  ghl_contact_id: string | null;
  ghl_call_id: string | null;
  call_type: 'intro' | 'demo' | 'other';
  call_date: string | null;
  call_duration_seconds: number | null;
  call_recording_url: string | null;
  raw_transcript: string | null;
  ai_summary: string | null;
  ai_lead_insights: string | null;
  ai_call_quality_score: number | null;
  ai_closer_performance: string | null;
  ai_next_steps: string | null;
  ai_red_flags: string | null;
  ai_buying_signals: string | null;
  analyzed_at: string | null;
  analysis_model: string | null;
  created_at: string;
}

export interface WindsorRow {
  id: string;
  date: string;
  campaign_id: string | null;
  campaign_name: string | null;
  ad_set_id: string | null;
  ad_id: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  created_at: string;
}

export interface KPIStats {
  totalSpend: number;
  totalLeads: number;
  cpl: number;
  introsCreated: number;
  introsBookedForMonth: number;
  costPerIntro: number;
  leadToIntroPct: number;
  introsShowed: number;
  introNoShow: number;
  introCancelled: number;
  dqRate: number;
  introShowRate: number;
  costPerShownIntro: number;
  demosCreated: number;
  demosBookedForMonth: number;
  costPerDemo: number;
  introToDemoPct: number;
  demosShowed: number;
  demoShowRate: number;
  costPerShownDemo: number;
  clientsClosed: number;
  closeRate: number;
  cpa: number;
  cashCollected: number;
  newMrr: number;
  avgCashPerClose: number;
  roasCash: number;
  roasLtv: number;
  trashLeads: number;
  costPerQualifiedLead: number;
  setterBookedIntros: number;
  instantConvertIntros: number;
  setterConversionRate: number;
}

export interface CallAnalysisResult {
  summary: string;
  lead_insights: string;
  call_quality_score: number;
  closer_performance: string;
  next_steps: string;
  red_flags: string;
  buying_signals: string;
}
