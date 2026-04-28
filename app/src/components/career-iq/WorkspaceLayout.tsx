import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { type CareerIQRoom } from './Sidebar';
import { useMediaQuery } from './useMediaQuery';
import { WorkspaceTopNav } from './WorkspaceTopNav';

interface WorkspaceLayoutProps {
  children: ReactNode;
}

/**
 * WorkspaceLayout wraps any authenticated page that needs workspace navigation.
 * It must be rendered inside CareerProfileProvider (already present in App.tsx's
 * main return tree).
 *
 * On mobile (< 768px) the top nav is hidden — mobile navigation is handled
 * separately by each page's own mobile layout.
 */
export function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const getActiveRoom = (): CareerIQRoom => {
    if (location.pathname === '/profile-setup') return 'career-profile';
    if (location.pathname.startsWith('/resume-builder')) return 'resume';
    // Approach C Sprint B2 — inside /workspace/applications or
    // /workspace/application/:id/*, none of the kanban rooms is "active."
    // Return 'dashboard' so no room button lights up; the dedicated My
    // Applications nav handles its own highlight (see Sidebar.tsx).
    if (
      location.pathname === '/workspace/applications'
      || location.pathname.startsWith('/workspace/application/')
    ) {
      return 'dashboard';
    }
    const params = new URLSearchParams(location.search);
    const room = params.get('room');
    if (
      room === 'career-profile'
      || room === 'resume'
      || room === 'linkedin'
      || room === 'jobs'
      || room === 'interview'
      || room === 'networking'
      || room === 'learning'
      || room === 'executive-bio'
    ) {
      return room;
    }
    return 'dashboard';
  };

  const handleNavigate = (room: CareerIQRoom) => {
    if (room === 'dashboard') {
      navigate('/workspace');
    } else {
      navigate(`/workspace?room=${room}`);
    }
  };

  if (isMobile) {
    // On mobile, render children without the top nav so mobile-specific
    // navigation inside each page takes over.
    return <>{children}</>;
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <WorkspaceTopNav
        activeRoom={getActiveRoom()}
        onNavigate={handleNavigate}
        onNavigateRoute={(route) => navigate(route)}
        pathname={location.pathname}
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
