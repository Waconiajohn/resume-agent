import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export function createUserClient(accessToken: string) {
  return createClient(supabaseUrl!, process.env.SUPABASE_ANON_KEY!, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}
