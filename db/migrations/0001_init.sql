-- Schéma initial de Tamis.
-- Les identifiants sont des entiers courts (F12, T3, S1…) : lisibles par le PO et peu coûteux pour le modèle.
-- La dimension des vecteurs suit le modèle d'embeddings déclaré dans lib/ai/models.ts (1536 pour text-embedding-3-small).

create extension if not exists vector;

create table clients (
  id integer generated always as identity primary key,
  name text not null unique,
  segment text not null check (segment in ('starter', 'pro', 'enterprise')),
  seats integer check (seats is null or seats >= 0),
  mrr numeric(10, 2) check (mrr is null or mrr >= 0),
  created_at timestamptz not null default now()
);

create table import_batches (
  id integer generated always as identity primary key,
  filename text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  feedback_count integer not null default 0,
  duplicate_count integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table feedback (
  id integer generated always as identity primary key,
  external_id text,
  client_id integer not null references clients (id),
  import_batch_id integer references import_batches (id),
  channel text not null check (channel in ('email', 'ticket', 'in_app', 'sales_call')),
  author text,
  received_at date not null,
  text text not null check (length(text) > 0),
  language text,
  -- Empreinte du texte normalisé et du client : un même retour reçu par deux canaux n'est compté qu'une fois.
  content_hash text not null,
  duplicate_of integer references feedback (id),
  status text not null default 'new' check (status in ('new', 'processed', 'needs_review')),
  review_reason text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index feedback_client_idx on feedback (client_id);
create index feedback_hash_idx on feedback (content_hash);

create table themes (
  id integer generated always as identity primary key,
  title text not null,
  need_statement text not null,
  -- Synthèse dont chaque phrase renvoie à ses retours sources par [F..].
  synthesis text,
  -- Signaux hors formule : déjà existant, risque de churn, concurrent cité.
  signals jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'triaged', 'planned', 'parked', 'shipped')),
  status_reason text,
  -- Facteurs RICE : le Reach est calculé par le code, les trois autres sont proposés puis ajustables.
  reach integer not null default 0,
  impact numeric(4, 2) check (impact is null or impact in (0.25, 0.5, 1, 2, 3)),
  confidence numeric(3, 2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  effort integer check (effort is null or effort >= 1),
  factor_sources jsonb not null default '{}'::jsonb,
  factor_justifications jsonb not null default '{}'::jsonb,
  rice_score numeric(10, 4),
  rank integer,
  moscow text check (moscow is null or moscow in ('must', 'should', 'could', 'wont')),
  moscow_source text not null default 'computed' check (moscow_source in ('computed', 'po')),
  embedding vector(1536),
  merged_into integer references themes (id),
  synthesized_at timestamptz,
  scored_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table feature_requests (
  id integer generated always as identity primary key,
  feedback_id integer not null references feedback (id) on delete cascade,
  theme_id integer references themes (id),
  kind text not null check (kind in ('feature', 'bug', 'praise', 'question', 'other')),
  requested_solution text,
  underlying_need text not null check (length(underlying_need) > 0),
  -- Sous-chaîne exacte du retour : vérifiée par le code avant l'insertion.
  quote text not null check (length(quote) > 0),
  sentiment text check (sentiment is null or sentiment in ('positive', 'neutral', 'negative')),
  urgency text check (urgency is null or urgency in ('none', 'low', 'high', 'churn_risk')),
  embedding vector(1536),
  -- Comment la demande a rejoint son thème : rattachement direct, confirmé par le modèle, ou nouveau thème.
  assignment jsonb,
  created_at timestamptz not null default now()
);

create index feature_requests_feedback_idx on feature_requests (feedback_id);
create index feature_requests_theme_idx on feature_requests (theme_id);

create table score_changes (
  id integer generated always as identity primary key,
  theme_id integer not null references themes (id),
  field text not null check (field in ('impact', 'confidence', 'effort', 'status', 'moscow', 'merge')),
  old_value text,
  new_value text,
  reason text,
  actor text not null check (actor in ('po', 'pipeline')),
  via text not null check (via in ('ui', 'agent', 'pipeline')),
  created_at timestamptz not null default now()
);

create index score_changes_theme_idx on score_changes (theme_id);

create table reference_stories (
  id integer generated always as identity primary key,
  title text not null,
  description text not null,
  points integer not null check (points in (1, 2, 3, 5, 8, 13)),
  tags text[] not null default '{}'
);

create table user_stories (
  id integer generated always as identity primary key,
  theme_id integer not null references themes (id),
  title text not null,
  persona text not null,
  want text not null,
  so_that text not null,
  acceptance_criteria jsonb not null,
  complexity_points integer check (complexity_points is null or complexity_points in (1, 2, 3, 5, 8, 13)),
  complexity_rationale text,
  reference_story_ids integer[] not null default '{}',
  open_questions jsonb not null default '[]'::jsonb,
  evidence_feedback_ids integer[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'reviewed')),
  version integer not null default 1,
  created_via text not null default 'ui' check (created_via in ('ui', 'agent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_stories_theme_idx on user_stories (theme_id);

create table agent_proposals (
  id integer generated always as identity primary key,
  conversation_id text,
  theme_id integer not null references themes (id),
  kind text not null check (kind in ('score_change', 'status_change')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table pipeline_runs (
  id integer generated always as identity primary key,
  import_batch_id integer references import_batches (id),
  stage text not null,
  subject text,
  model text,
  prompt_version text,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(12, 6),
  duration_ms integer,
  status text not null check (status in ('ok', 'retried', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

create index pipeline_runs_batch_idx on pipeline_runs (import_batch_id);
