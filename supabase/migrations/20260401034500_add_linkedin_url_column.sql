-- Add linkedin_url column to client_connections for storing profile URLs from CSV imports
ALTER TABLE client_connections ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
