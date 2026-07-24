import { notFound } from 'next/navigation';
import type { DetectorStat, FlagRule, Project } from '@snag/shared';
import { api, ApiError } from '@/lib/api';
import { SettingsTabs } from '@/components/SettingsTabs';
import type { BuiltinFlag } from '@/components/DetectorTuner';

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
  const [flags, detectorStats] = await Promise.all([
    api<{ builtins: BuiltinFlag[]; custom: FlagRule[] }>(`/api/projects/${projectId}/flags`),
    api<DetectorStat[]>(`/api/projects/${projectId}/detector-stats`),
  ]);

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
      <SettingsTabs
        project={project}
        flags={flags}
        detectorStats={detectorStats}
        snippet={snippet}
      />
    </>
  );
}
