import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import type { Project } from '@snag/shared';
import { ProjectSwitcher, type SwitcherProject } from '@/components/ProjectSwitcher';
import { SideNav } from '@/components/SideNav';
import { LogoutButton } from '@/components/LogoutButton';
import { Wordmark } from '@/components/Wordmark';

export const dynamic = 'force-dynamic';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const projects = await api<(Project & { openIssues: number })[]>('/api/projects');
  const current = projects.find((p) => p.id === projectId);
  if (!current) notFound();

  const switcherProjects: SwitcherProject[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    openIssues: p.openIssues,
  }));

  return (
    <div className="shell">
      <aside className="sidebar">
        <Wordmark />
        <div style={{ padding: '14px 4px 0' }}>
          <ProjectSwitcher projects={switcherProjects} currentId={projectId} />
        </div>
        <SideNav projectId={projectId} />
        <div className="spacer" />
        <div className="side-foot">
          <LogoutButton />
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
