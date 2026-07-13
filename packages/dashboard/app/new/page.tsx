import Link from 'next/link';
import { Wordmark } from '@/components/Wordmark';
import { CreateProjectForm } from '@/components/CreateProjectForm';

export const dynamic = 'force-dynamic';

export default function NewProjectPage() {
  return (
    <div className="login-wrap">
      <div className="login-card" style={{ width: 460 }}>
        <Wordmark style={{ padding: 0, marginBottom: 14, fontSize: 22 }} />
        <p className="muted" style={{ marginBottom: 18 }}>
          Create a new project — it gets its own SDK key and its own dashboard. One deployment can
          watch many apps.
        </p>
        <CreateProjectForm />
        <p style={{ marginTop: 16, textAlign: 'center', fontSize: 13 }}>
          <Link href="/">← back to dashboard</Link>
        </p>
      </div>
    </div>
  );
}
