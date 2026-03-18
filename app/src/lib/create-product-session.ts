import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';

import type { CoachSession } from '@/types/session';

interface CreateProductSessionInput {
  productType: string;
  jobApplicationId?: string;
}

interface CreateProductSessionResult {
  accessToken: string;
  session: CoachSession;
}

export async function createProductSession({
  productType,
  jobApplicationId,
}: CreateProductSessionInput): Promise<CreateProductSessionResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? null;
  if (!accessToken) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      product_type: productType,
      job_application_id: jobApplicationId,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to create ${productType} session (${response.status}): ${body}`);
  }

  const data = await response.json() as { session?: CoachSession };
  if (!data.session?.id) {
    throw new Error(`Failed to create ${productType} session: missing session id`);
  }

  return {
    accessToken,
    session: data.session,
  };
}
