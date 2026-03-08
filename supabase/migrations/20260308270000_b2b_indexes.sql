-- B2B Outplacement — performance indexes
-- Phase 7 audit fix: missing indexes for seat and org queries

-- Composite index for seat queries filtered by contract + org
CREATE INDEX IF NOT EXISTS idx_b2b_seats_contract_org
  ON b2b_seats (contract_id, org_id);

-- Index for seat status queries scoped to an org
CREATE INDEX IF NOT EXISTS idx_b2b_seats_status_org
  ON b2b_seats (status, org_id);

-- Partial index for active orgs (most org lookups filter on is_active)
CREATE INDEX IF NOT EXISTS idx_b2b_orgs_active
  ON b2b_organizations (is_active)
  WHERE is_active = true;
