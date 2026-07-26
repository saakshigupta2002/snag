import { notFound } from 'next/navigation';
import type { DetectorStat, FlagRule, FunnelDef, FunnelResult, Project } from '@snag/shared';
import { api, ApiError } from '@/lib/api';
import { SettingsTabs } from '@/components/SettingsTabs';
import type { BuiltinFlag } from '@/components/DetectorTuner';

export const dynamic = 'force-dynamic';

const TABS = ['general', 'detectors', 'flags', 'funnels', 'alerts', 'sharing'] as const;
type TabId = (typeof TABS)[number];

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { projectId } = await params;
  const tab = (await searchParams).tab;
  const initialTab: TabId = TABS.includes(tab as TabId) ? (tab as TabId) : 'general';
  let project: Project;
  try {
    project = await api<Project>(`/api/projects/${projectId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const [flags, detectorStats, funnels] = await Promise.all([
    api<{ builtins: BuiltinFlag[]; custom: FlagRule[] }>(`/api/projects/${projectId}/flags`),
    api<DetectorStat[]>(`/api/projects/${projectId}/detector-stats`),
    api<{ funnels: FunnelDef[]; results: FunnelResult[] }>(`/api/projects/${projectId}/funnels`),
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
        funnels={funnels}
        snippet={snippet}
        initialTab={initialTab}
      />
    </>
  );
}
