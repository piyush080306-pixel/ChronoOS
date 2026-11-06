/*
# Create ChronoOS simulation persistence

1. New Tables
- `chrono_simulations`: one row per simulation run. Holds the name, the full configuration (processes, CPU/memory/disk/resource settings, seed, snapshot interval) as JSON.
- `chrono_branches`: timelines that belong to a simulation. Each branch records its parent branch, the timestamp and event sequence where it forked, and its own configuration.
- `chrono_events`: immutable historical event log. Each row has a per-branch sequence number, simulation timestamp, event type, affected process/resource, JSON payload and a readable description.
- `chrono_snapshots`: full serialized system state captured at configurable intervals, used to rebuild historical states quickly.

2. Security
- Row level security is enabled on every table.
- The app has no sign-in screen, so anon and authenticated roles get full CRUD. The data is intentionally shared and public to the app.

3. Important notes
- Event sequence numbers are unique within a branch (enforced by a unique index), so the history cannot contain duplicate positions.
- Deleting a branch removes only that branch's rows; the parent branch and its events are never modified.
- No existing tables are altered or dropped.
*/

CREATE TABLE IF NOT EXISTS chrono_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  config jsonb NOT NULL,
  seed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chrono_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id uuid NOT NULL REFERENCES chrono_simulations(id) ON DELETE CASCADE,
  name text NOT NULL,
  parent_branch_id uuid REFERENCES chrono_branches(id) ON DELETE RESTRICT,
  base_timestamp integer,
  base_seq integer,
  config jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chrono_branches_simulation_idx ON chrono_branches (simulation_id);
CREATE INDEX IF NOT EXISTS chrono_branches_parent_idx ON chrono_branches (parent_branch_id);

CREATE TABLE IF NOT EXISTS chrono_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id uuid NOT NULL REFERENCES chrono_simulations(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES chrono_branches(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  timestamp integer NOT NULL,
  event_type text NOT NULL,
  process_id text,
  resource_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chrono_events_branch_seq_unique UNIQUE (branch_id, seq)
);

CREATE INDEX IF NOT EXISTS chrono_events_branch_time_idx ON chrono_events (branch_id, timestamp);
CREATE INDEX IF NOT EXISTS chrono_events_type_idx ON chrono_events (branch_id, event_type);

CREATE TABLE IF NOT EXISTS chrono_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id uuid NOT NULL REFERENCES chrono_simulations(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES chrono_branches(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  timestamp integer NOT NULL,
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chrono_snapshots_branch_seq_unique UNIQUE (branch_id, seq)
);

ALTER TABLE chrono_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chrono_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE chrono_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE chrono_snapshots ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON chrono_simulations TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON chrono_branches TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON chrono_events TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON chrono_snapshots TO anon, authenticated;

DROP POLICY IF EXISTS "anon_all_chrono_simulations_select" ON chrono_simulations;
CREATE POLICY "anon_all_chrono_simulations_select" ON chrono_simulations FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_all_chrono_simulations_insert" ON chrono_simulations;
CREATE POLICY "anon_all_chrono_simulations_insert" ON chrono_simulations FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_all_chrono_simulations_update" ON chrono_simulations;
CREATE POLICY "anon_all_chrono_simulations_update" ON chrono_simulations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_all_chrono_simulations_delete" ON chrono_simulations;
CREATE POLICY "anon_all_chrono_simulations_delete" ON chrono_simulations FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_all_chrono_branches_select" ON chrono_branches;
CREATE POLICY "anon_all_chrono_branches_select" ON chrono_branches FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_all_chrono_branches_insert" ON chrono_branches;
CREATE POLICY "anon_all_chrono_branches_insert" ON chrono_branches FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_all_chrono_branches_update" ON chrono_branches;
CREATE POLICY "anon_all_chrono_branches_update" ON chrono_branches FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_all_chrono_branches_delete" ON chrono_branches;
CREATE POLICY "anon_all_chrono_branches_delete" ON chrono_branches FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_all_chrono_events_select" ON chrono_events;
CREATE POLICY "anon_all_chrono_events_select" ON chrono_events FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_all_chrono_events_insert" ON chrono_events;
CREATE POLICY "anon_all_chrono_events_insert" ON chrono_events FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_all_chrono_events_update" ON chrono_events;
CREATE POLICY "anon_all_chrono_events_update" ON chrono_events FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_all_chrono_events_delete" ON chrono_events;
CREATE POLICY "anon_all_chrono_events_delete" ON chrono_events FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_all_chrono_snapshots_select" ON chrono_snapshots;
CREATE POLICY "anon_all_chrono_snapshots_select" ON chrono_snapshots FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_all_chrono_snapshots_insert" ON chrono_snapshots;
CREATE POLICY "anon_all_chrono_snapshots_insert" ON chrono_snapshots FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_all_chrono_snapshots_update" ON chrono_snapshots;
CREATE POLICY "anon_all_chrono_snapshots_update" ON chrono_snapshots FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_all_chrono_snapshots_delete" ON chrono_snapshots;
CREATE POLICY "anon_all_chrono_snapshots_delete" ON chrono_snapshots FOR DELETE TO anon, authenticated USING (true);
