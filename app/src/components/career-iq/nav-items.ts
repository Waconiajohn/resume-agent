import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  User,
  Radio,
  FileText,
  Search,
  BriefcaseBusiness,
  GraduationCap,
  Trophy,
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
    label: 'Today',
    description: 'Your daily plan and next best move',
    icon: LayoutDashboard,
    room: 'dashboard',
    mobileTab: true,
  },
  {
    id: 'career-profile',
    label: 'Career Vault',
    description: 'Your resume, LinkedIn profile, proof, achievements, and story',
    icon: User,
    room: 'career-profile',
    mobileTab: true,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn Growth',
    description: 'Profile SEO, recruiter visibility, posts, blogs, and carousels',
    icon: Radio,
    room: 'linkedin',
    mobileTab: true,
  },
  {
    id: 'jobs',
    label: 'Find Jobs',
    description: 'Find the right jobs before tailoring your resume',
    icon: Search,
    room: 'jobs',
    mobileTab: true,
  },
  {
    id: 'resume',
    label: 'Tailor Resume',
    description: 'Tailor your resume to a specific job',
    icon: FileText,
    room: 'resume',
    mobileTab: true,
  },
  {
    id: 'applications',
    label: 'Applications',
    description: 'Saved opportunities, application assets, and next steps',
    icon: BriefcaseBusiness,
    route: '/workspace/applications',
    mobileTab: true,
  },
  {
    id: 'interview',
    label: 'Interview & Offer',
    description: 'Interview prep, thank-yous, follow-ups, and negotiation',
    icon: Trophy,
    room: 'interview',
    mobileTab: false,
  },
  {
    id: 'learning',
    label: 'Playbook',
    description: 'The 46-lesson benchmark-candidate method',
    icon: GraduationCap,
    room: 'learning',
    mobileTab: false,
  },
];

export const BOTTOM_TAB_NAV: readonly NavItem[] = SIDEBAR_NAV.filter((item) => item.mobileTab);

export function isApplicationsPath(pathname: string): boolean {
  return pathname === '/workspace/applications'
    || pathname.startsWith('/workspace/application/');
}
