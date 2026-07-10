import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import type { Project } from '@snag/shared';
import { ProjectSwitcher, type SwitcherProject } from '@/components/ProjectSwitcher';
import { LogoutButton } from '@/components/LogoutButton';

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
        <div className="logo">
          Snag<span>.</span>
        </div>
        <ProjectSwitcher projects={switcherProjects} currentId={projectId} />
        <nav>
          <Link href={`/p/${projectId}/issues`}>Issues</Link>
          <Link href={`/p/${projectId}/sessions`}>Sessions</Link>
          <Link href={`/p/${projectId}/settings`}>Settings</Link>
        </nav>
        <div className="spacer" />
        <LogoutButton />
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
