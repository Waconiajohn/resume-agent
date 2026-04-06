import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sidebar, type CareerIQRoom } from './Sidebar';
import { useCareerProfile } from './CareerProfileContext';
import { useMediaQuery } from './useMediaQuery';

interface WorkspaceLayoutProps {
  children: ReactNode;
}

/**
 * WorkspaceLayout wraps any authenticated page that needs the left sidebar.
 * It must be rendered inside CareerProfileProvider (already present in App.tsx's
 * main return tree).
 *
 * On mobile (< 768px) the sidebar is hidden — mobile navigation is handled
 * separately by each page's own mobile layout.
 */
export function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { dashboardState } = useCareerProfile();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const getActiveRoom = (): CareerIQRoom => {
    if (location.pathname === '/profile-setup') return 'career-profile';
    if (location.pathname.startsWith('/resume-builder')) return 'resume';
    const params = new URLSearchParams(location.search);
    const room = params.get('room');
    if (
      room === 'career-profile'
      || room === 'resume'
      || room === 'linkedin'
      || room === 'jobs'
      || room === 'interview'
      || room === 'networking'
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
    // On mobile, render children without the sidebar so mobile-specific
    // navigation inside each page takes over.
    return <>{children}</>;
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <Sidebar
        activeRoom={getActiveRoom()}
        onNavigate={handleNavigate}
        dashboardState={dashboardState}
        defaultCollapsed={location.pathname === '/resume-builder/session'}
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
