import { redirect } from 'next/navigation';
import type { Project } from '@snag/shared';
import { api } from '@/lib/api';
import { CreateProjectForm } from '@/components/CreateProjectForm';
import { Wordmark } from '@/components/Wordmark';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let projects: Project[] = [];
  let ingestDown = false;
  try {
    projects = await api<Project[]>('/api/projects');
  } catch {
    ingestDown = true;
  }

  if (projects.length) redirect(`/p/${projects[0]!.id}/issues`);

  return (
    <div className="login-wrap">
      <div className="login-card" style={{ width: 460 }}>
        <Wordmark style={{ padding: 0, marginBottom: 14, fontSize: 22 }} />
        {ingestDown ? (
          <>
            <p className="muted">
              Can’t reach the ingest service. Is it running and is <code>INGEST_URL</code> set?
            </p>
            <pre className="snippet">docker compose up{'\n'}# or: npm run dev:ingest</pre>
          </>
        ) : (
          <>
            <p className="muted" style={{ marginBottom: 18 }}>
              Catch the moments your app trips users up. Create your first project to get an SDK
              key.
            </p>
            <CreateProjectForm />
          </>
        )}
      </div>
    </div>
  );
}
