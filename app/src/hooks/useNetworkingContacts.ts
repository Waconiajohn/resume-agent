import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export interface NetworkingContact {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  email: string | null;
  linkedin_url: string | null;
  phone: string | null;
  relationship_type: string;
  relationship_strength: number;
  tags: string[];
  notes: string | null;
  next_followup_at: string | null;
  last_contact_date: string | null;
  application_id: string | null;
  contact_role: string | null;
  created_at: string;
  updated_at: string;
}

export interface Touchpoint {
  id: string;
  contact_id: string;
  type: string;
  notes: string | null;
  created_at: string;
}

export interface CreateContactData {
  name: string;
  title?: string;
  company?: string;
  email?: string;
  linkedin_url?: string;
  phone?: string;
  relationship_type?: string;
  relationship_strength?: number;
  tags?: string[];
  notes?: string;
  next_followup_at?: string;
  application_id?: string;
  contact_role?: string;
}

export interface ContactFilters {
  relationship_type?: string;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

interface NetworkingContactsState {
  contacts: NetworkingContact[];
  loading: boolean;
  error: string | null;
}

async function getAuthHeader(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

export function useNetworkingContacts() {
  const [state, setState] = useState<NetworkingContactsState>({
    contacts: [],
    loading: false,
    error: null,
  });

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchContacts = useCallback(async (filters?: ContactFilters): Promise<void> => {
    if (!mountedRef.current) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) {
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            contacts: [],
            loading: false,
            error: 'Not authenticated',
          }));
        }
        return;
      }

      const params = new URLSearchParams();
      if (filters?.relationship_type) params.set('relationship_type', filters.relationship_type);
      if (filters?.search) params.set('search', filters.search);
      if (filters?.sort_by) params.set('sort_by', filters.sort_by);
      if (filters?.sort_order) params.set('sort_order', filters.sort_order);

      const qs = params.toString();
      const url = `${API_BASE}/networking/contacts${qs ? `?${qs}` : ''}`;

      const res = await fetch(url, { headers: authHeader });

      if (!res.ok) {
        const body = await res.text();
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: `Failed to fetch contacts (${res.status}): ${body}`,
          }));
        }
        return;
      }

      const data = (await res.json()) as {
        contacts?: NetworkingContact[];
        count?: number;
        feature_disabled?: boolean;
      };
      if (data.feature_disabled) {
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            contacts: [],
            loading: false,
            error: null,
          }));
        }
        return;
      }
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, contacts: data.contacts ?? [], loading: false }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, loading: false, error: message }));
      }
    }
  }, []);

  const createContact = useCallback(async (data: CreateContactData): Promise<NetworkingContact | null> => {
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return null;

      const res = await fetch(`${API_BASE}/networking/contacts`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) return null;

      const result = (await res.json()) as { contact: NetworkingContact };
      if (mountedRef.current) {
        setState((prev) => ({
          ...prev,
          contacts: [result.contact, ...prev.contacts],
        }));
      }
      return result.contact;
    } catch {
      return null;
    }
  }, []);

  const updateContact = useCallback(
    async (id: string, data: Partial<CreateContactData>): Promise<NetworkingContact | null> => {
      try {
        const authHeader = await getAuthHeader();
        if (!authHeader) return null;

        const res = await fetch(`${API_BASE}/networking/contacts/${id}`, {
          method: 'PATCH',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!res.ok) return null;

        const result = (await res.json()) as { contact: NetworkingContact };
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            contacts: prev.contacts.map((c) => (c.id === id ? result.contact : c)),
          }));
        }
        return result.contact;
      } catch {
        return null;
      }
    },
    [],
  );

  const deleteContact = useCallback(async (id: string): Promise<boolean> => {
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return false;

      const res = await fetch(`${API_BASE}/networking/contacts/${id}`, {
        method: 'DELETE',
        headers: authHeader,
      });

      if (!res.ok) return false;

      if (mountedRef.current) {
        setState((prev) => ({
          ...prev,
          contacts: prev.contacts.filter((c) => c.id !== id),
        }));
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const logTouchpoint = useCallback(
    async (contactId: string, type: string, notes?: string): Promise<Touchpoint | null> => {
      try {
        const authHeader = await getAuthHeader();
        if (!authHeader) return null;

        const res = await fetch(`${API_BASE}/networking/contacts/${contactId}/touchpoints`, {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, notes }),
        });

        if (!res.ok) return null;

        const result = (await res.json()) as { touchpoint: Touchpoint };
        // Update last_contact_date in local state
        if (mountedRef.current) {
          const now = new Date().toISOString();
          setState((prev) => ({
            ...prev,
            contacts: prev.contacts.map((c) =>
              c.id === contactId ? { ...c, last_contact_date: now } : c,
            ),
          }));
        }
        return result.touchpoint;
      } catch {
        return null;
      }
    },
    [],
  );

  const fetchFollowUps = useCallback(async (days = 7): Promise<NetworkingContact[]> => {
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return [];

      const res = await fetch(`${API_BASE}/networking/follow-ups?days=${days}`, {
        headers: authHeader,
      });

      if (!res.ok) return [];

      const data = (await res.json()) as { contacts: NetworkingContact[]; days_ahead: number };
      return data.contacts;
    } catch {
      return [];
    }
  }, []);

  const fetchTouchpoints = useCallback(async (contactId: string): Promise<Touchpoint[]> => {
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return [];

      const res = await fetch(`${API_BASE}/networking/contacts/${contactId}/touchpoints`, {
        headers: authHeader,
      });

      if (!res.ok) return [];

      const data = (await res.json()) as { touchpoints: Touchpoint[] };
      return data.touchpoints;
    } catch {
      return [];
    }
  }, []);

  return {
    ...state,
    fetchContacts,
    createContact,
    updateContact,
    deleteContact,
    logTouchpoint,
    fetchFollowUps,
    fetchTouchpoints,
  };
}
