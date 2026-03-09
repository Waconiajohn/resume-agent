-- Add application linking columns to networking_contacts
ALTER TABLE networking_contacts ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES application_pipeline(id) ON DELETE SET NULL;
ALTER TABLE networking_contacts ADD COLUMN IF NOT EXISTS contact_role text CHECK (contact_role IN ('hiring_manager', 'team_leader', 'peer', 'hr_recruiter'));

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_networking_contacts_application_id ON networking_contacts(application_id) WHERE application_id IS NOT NULL;

COMMENT ON COLUMN networking_contacts.application_id IS 'Links contact to a job application for Rule of Four tracking';
COMMENT ON COLUMN networking_contacts.contact_role IS 'Role category for Rule of Four: hiring_manager, team_leader, peer, hr_recruiter';
