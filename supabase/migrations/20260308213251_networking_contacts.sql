-- Networking CRM tables for Phase 3C

CREATE TABLE IF NOT EXISTS networking_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text,
  company text,
  email text,
  linkedin_url text,
  phone text,
  relationship_type text NOT NULL DEFAULT 'other'
    CHECK (relationship_type IN ('recruiter', 'hiring_manager', 'peer', 'referral', 'mentor', 'other')),
  relationship_strength integer NOT NULL DEFAULT 1 CHECK (relationship_strength BETWEEN 1 AND 5),
  tags jsonb DEFAULT '[]'::jsonb,
  notes text,
  last_contact_date timestamptz,
  next_followup_at timestamptz,
  ni_connection_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE networking_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own networking contacts"
  ON networking_contacts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_networking_contacts_user_id ON networking_contacts(user_id);
CREATE INDEX idx_networking_contacts_next_followup ON networking_contacts(user_id, next_followup_at) WHERE next_followup_at IS NOT NULL;
CREATE INDEX idx_networking_contacts_relationship ON networking_contacts(user_id, relationship_type);

CREATE TABLE IF NOT EXISTS contact_touchpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES networking_contacts(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('call', 'email', 'inmail', 'meeting', 'event', 'other')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contact_touchpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own contact touchpoints"
  ON contact_touchpoints FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_contact_touchpoints_contact ON contact_touchpoints(contact_id);
CREATE INDEX idx_contact_touchpoints_user ON contact_touchpoints(user_id);

-- moddatetime trigger for networking_contacts.updated_at
CREATE TRIGGER networking_contacts_updated_at
  BEFORE UPDATE ON networking_contacts
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
