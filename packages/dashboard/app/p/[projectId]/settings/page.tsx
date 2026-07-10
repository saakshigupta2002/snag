import { notFound } from 'next/navigation';
import type { FlagRule, Project } from '@snag/shared';
import { api, ApiError } from '@/lib/api';
import { CopyButton } from '@/components/CopyButton';
import { ProjectSettingsForm } from '@/components/ProjectSettingsForm';
import { FlagTable, type BuiltinFlag } from '@/components/FlagTable';
import { CustomFlagBuilder } from '@/components/CustomFlagBuilder';
import { CustomFlagList } from '@/components/CustomFlagList';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  let project: Project;
  try {
    project = await api<Project>(`/api/projects/${projectId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const flags = await api<{ builtins: BuiltinFlag[]; custom: FlagRule[] }>(
    `/api/projects/${projectId}/flags`,
  );

  const snippet = `import { Snag } from "@snag/sdk";

Snag.init({
  projectKey: "${project.projectKey}",
  endpoint: "https://your-ingest-host",  // where @snag/ingest runs
  maskAllInputs: true,                   // default — loosen deliberately
  captureNetwork: true,                  // default — redaction always applied
});`;

  return (
    <>
      <h1>Settings</h1>
      <p className="subtitle">{project.name}</p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Install the SDK</h2>
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="muted">Project key</span>
          <code className="chip">{project.projectKey}</code>
          <CopyButton text={project.projectKey} />
        </div>
        <pre className="snippet">{snippet}</pre>
        <p className="muted" style={{ fontSize: 12.5 }}>
          Masking happens in the browser before anything is sent: passwords always, all inputs by
          default, plus a pattern safety net for emails/cards/tokens. Add{' '}
          <code>.snag-block</code> to hide an element entirely, <code>.snag-mask</code> to keep
          layout but hide text.
        </p>
      </div>

      <ProjectSettingsForm
        projectId={project.id}
        name={project.name}
        settings={project.settings}
      />

      <h2>Detectors</h2>
      <p className="muted" style={{ marginTop: -4 }}>
        Toggle and tune per project. Tier 2 detectors ship off until tuned against real traffic —
        precision over coverage.
      </p>
      <FlagTable projectId={project.id} flags={flags.builtins} />

      <h2>Custom flags</h2>
      <CustomFlagList projectId={project.id} rules={flags.custom} />
      <div style={{ height: 10 }} />
      <CustomFlagBuilder projectId={project.id} />
    </>
  );
}
