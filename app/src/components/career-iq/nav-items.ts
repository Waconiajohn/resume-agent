import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  User,
  Search,
  BriefcaseBusiness,
  Radio,
  GraduationCap,
} from 'lucide-react';
import type { ExposedWorkspaceRoom } from './workspaceRoomAccess';

// Single source of truth for the top-level workspace nav. Three surfaces
// consume this list: Sidebar (desktop), Header mobile hamburger, and the
// MobileBriefing bottom tab bar. Do not inline nav entries in those files.

export type NavItem = {
  id: ExposedWorkspaceRoom | 'applications';
  label: string;
  description: string;
  icon: LucideIcon;
  /** Room-based entries navigate via `onNavigate(room)`. */
  room?: ExposedWorkspaceRoom;
  /** Route-based entries navigate via `onNavigateRoute(route)`. */
  route?: string;
  /** Whether this item appears in the mobile bottom tab bar. */
  mobileTab: boolean;
};

export const SIDEBAR_NAV: readonly NavItem[] = [
  {
    id: 'dashboard',
    label: 'Home',
    description: 'Your daily workspace view',
    icon: LayoutDashboard,
    room: 'dashboard',
    mobileTab: true,
  },
  {
    id: 'career-profile',
    label: 'Career Vault',
    description: 'Your positioning, career record, and LinkedIn brand in one place',
    icon: User,
    room: 'career-profile',
    mobileTab: true,
  },
  {
    id: 'jobs',
    label: 'Job Search',
    description: 'Search, pipeline, and next moves',
    icon: Search,
    room: 'jobs',
    mobileTab: true,
  },
  {
    id: 'applications',
    label: 'Applications',
    description: 'Saved jobs and per-role work',
    icon: BriefcaseBusiness,
    route: '/workspace/applications',
    mobileTab: true,
  },
  {
    id: 'live-webinars',
    label: 'Live Webinars',
    description: '3-4 live sessions per week on career-building topics',
    icon: Radio,
    room: 'live-webinars',
    mobileTab: false,
  },
  {
    id: 'learning',
    label: 'Masterclass',
    description: 'Career-building courses personalized with your data',
    icon: GraduationCap,
    room: 'learning',
    mobileTab: true,
  },
];

export const BOTTOM_TAB_NAV: readonly NavItem[] = SIDEBAR_NAV.filter((item) => item.mobileTab);

export function isApplicationsPath(pathname: string): boolean {
  return pathname === '/workspace/applications'
    || pathname.startsWith('/workspace/application/');
}
