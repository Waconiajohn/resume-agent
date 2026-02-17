CREATE TABLE waitlist_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  source text DEFAULT 'sales_page',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE waitlist_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can join waitlist" ON waitlist_emails
  FOR INSERT WITH CHECK (true);
