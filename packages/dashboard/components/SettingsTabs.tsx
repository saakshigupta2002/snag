'use client';

import { useState } from 'react';
import type {
  DetectorStat,
  FlagRule,
  FunnelDef,
  FunnelResult,
  Project,
  ProjectSettings,
} from '@snag/shared';
import { CopyButton } from './CopyButton';
import { ProjectSettingsForm } from './ProjectSettingsForm';
import { DetectorTuner, type BuiltinFlag } from './DetectorTuner';
import { AlertsForm } from './AlertsForm';
import { ShareForm } from './ShareForm';
import { CustomFlagBuilder } from './CustomFlagBuilder';
import { CustomFlagList } from './CustomFlagList';
import { FunnelManager } from './FunnelManager';

type TabId = 'general' | 'detectors' | 'flags' | 'funnels' | 'alerts' | 'sharing';

const TABS: { id: TabId; label: string; blurb: string }[] = [
  { id: 'general', label: 'General', blurb: 'Project name, retention and the SDK install snippet.' },
  { id: 'detectors', label: 'Detectors', blurb: 'Toggle and tune what gets flagged, per project.' },
  { id: 'flags', label: 'Custom flags', blurb: 'Your own rules on top of the built-in detectors.' },
  { id: 'funnels', label: 'Funnels', blurb: 'Track a flow and watch the sessions behind each drop-off.' },
  { id: 'alerts', label: 'Alerts', blurb: 'Where new issues get delivered.' },
  { id: 'sharing', label: 'Sharing', blurb: 'A read-only public link to this project.' },
];

export function SettingsTabs({
  project,
  flags,
  detectorStats,
  funnels,
  snippet,
  initialTab = 'general',
}: {
  project: Project;
  flags: { builtins: BuiltinFlag[]; custom: FlagRule[] };
  detectorStats: DetectorStat[];
  funnels: { funnels: FunnelDef[]; results: FunnelResult[] };
  snippet: string;
  initialTab?: TabId;
}) {
  const [tab, setTab] = useState<TabId>(initialTab);
  const active = TABS.find((t) => t.id === tab)!;
  const settings = project.settings as ProjectSettings;

  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="Settings sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={t.id === tab ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section className="settings-panel">
        <header className="settings-section-head">
          <h2>{active.label}</h2>
          <p className="muted">{active.blurb}</p>
        </header>

        {tab === 'general' && (
          <>
            <div className="card">
              <h3>Install the SDK</h3>
              <div className="row" style={{ marginBottom: 10 }}>
                <span className="muted">Project key</span>
                <code className="chip">{project.projectKey}</code>
                <CopyButton text={project.projectKey} />
              </div>
              <pre className="snippet">{snippet}</pre>
              <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
                Masking happens in the browser before anything is sent: passwords always, all inputs
                by default, plus a pattern safety net for emails/cards/tokens. Add{' '}
                <code>.snag-block</code> to hide an element entirely, <code>.snag-mask</code> to keep
                layout but hide text.
              </p>
            </div>
            <ProjectSettingsForm
              projectId={project.id}
              name={project.name}
              settings={settings}
            />
          </>
        )}

        {tab === 'detectors' && (
          <DetectorTuner projectId={project.id} flags={flags.builtins} stats={detectorStats} />
        )}

        {tab === 'flags' && (
          <>
            <CustomFlagList projectId={project.id} rules={flags.custom} />
            <div style={{ height: 12 }} />
            <CustomFlagBuilder projectId={project.id} />
          </>
        )}

        {tab === 'funnels' && (
          <FunnelManager
            projectId={project.id}
            funnels={funnels.funnels}
            results={funnels.results}
          />
        )}

        {tab === 'alerts' && <AlertsForm projectId={project.id} settings={settings} />}

        {tab === 'sharing' && <ShareForm projectId={project.id} settings={settings} />}
      </section>
    </div>
  );
}
