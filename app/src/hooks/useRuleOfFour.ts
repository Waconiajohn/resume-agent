import { useCallback, useMemo, useEffect } from 'react';
import { useApplicationPipeline, type Application } from '@/hooks/useApplicationPipeline';
import { useNetworkingContacts, type NetworkingContact, type CreateContactData } from '@/hooks/useNetworkingContacts';

export type ContactRole = 'hiring_manager' | 'team_leader' | 'peer' | 'hr_recruiter';

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  hiring_manager: 'Hiring Manager',
  team_leader: 'Team Leader',
  peer: 'Peer',
  hr_recruiter: 'HR / Recruiter',
};

export const ALL_ROLES: ContactRole[] = ['hiring_manager', 'team_leader', 'peer', 'hr_recruiter'];

export interface RuleOfFourGroup {
  application: Application;
  contacts: NetworkingContact[];
  progress: number; // 0-4
  missingRoles: ContactRole[];
}

export function useRuleOfFour() {
  const pipeline = useApplicationPipeline();
  const contacts = useNetworkingContacts();

  useEffect(() => {
    pipeline.fetchApplications();
    contacts.fetchContacts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups: RuleOfFourGroup[] = useMemo(() => {
    const activeApps = pipeline.applications.filter(
      (a) => a.stage !== 'closed_won' && a.stage !== 'closed_lost',
    );

    return activeApps.map((app) => {
      const linkedContacts = contacts.contacts.filter((c) => c.application_id === app.id);
      const filledRoles = linkedContacts
        .map((c) => c.contact_role)
        .filter((r): r is ContactRole => ALL_ROLES.includes(r as ContactRole));
      const missingRoles = ALL_ROLES.filter((r) => !filledRoles.includes(r));

      return {
        application: app,
        contacts: linkedContacts,
        progress: Math.min(filledRoles.length, 4),
        missingRoles,
      };
    });
  }, [pipeline.applications, contacts.contacts]);

  const addContactToApplication = useCallback(
    async (
      applicationId: string,
      contactRole: ContactRole,
      contactData: CreateContactData,
    ): Promise<NetworkingContact | null> => {
      return contacts.createContact({
        ...contactData,
        application_id: applicationId,
        contact_role: contactRole,
      });
    },
    [contacts.createContact],
  );

  const refresh = useCallback(async (): Promise<void> => {
    await Promise.all([pipeline.fetchApplications(), contacts.fetchContacts()]);
  }, [pipeline.fetchApplications, contacts.fetchContacts]);

  return {
    groups,
    loading: pipeline.loading || contacts.loading,
    error: pipeline.error || contacts.error,
    addContactToApplication,
    refresh,
    createContact: contacts.createContact,
    logTouchpoint: contacts.logTouchpoint,
    contacts: contacts.contacts,
  };
}
