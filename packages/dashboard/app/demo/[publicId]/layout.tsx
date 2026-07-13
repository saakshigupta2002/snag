import { notFound } from 'next/navigation';
import { resolveDemo } from '@/lib/demo';
import { Wordmark } from '@/components/Wordmark';
import { DemoNav } from '@/components/DemoNav';

export const dynamic = 'force-dynamic';

export default async function DemoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const project = await resolveDemo(publicId);
  if (!project) notFound();

  return (
    <div className="shell">
      <aside className="sidebar">
        <Wordmark />
        <div className="demo-badge mono">
          <span className="demo-dot" /> read-only demo
        </div>
        <DemoNav publicId={publicId} />
        <div className="spacer" />
        <div className="side-foot">
          <a
            className="demo-cta mono"
            href="https://github.com/saakshigupta2002/snag"
            target="_blank"
            rel="noreferrer"
          >
            ★ Snag on GitHub
          </a>
        </div>
      </aside>
      <main className="main">
        <div className="demo-banner">
          <span className="mono demo-live">◉ live demo</span>
          <span>
            A read-only tour of <strong>{project.name}</strong> in Snag — a self-hosted, privacy-first
            session watcher. Browse the flagged issues and watch the replays. Nothing here can be
            changed, and no account or data access is exposed.
          </span>
        </div>
        {children}
      </main>
    </div>
  );
}
