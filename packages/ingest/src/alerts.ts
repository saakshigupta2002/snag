import type { IssueCandidate, Project, Session, Severity } from '@snag/shared';

const RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };

/**
 * Fire the project's alert webhook for genuinely-new issue groups that meet the
 * severity threshold. One payload works for both Slack (reads `text`) and
 * generic consumers (read the structured fields). Fails quietly.
 */
export async function fireAlerts(
  project: Project,
  session: Session,
  newGroups: IssueCandidate[],
): Promise<void> {
  const alerts = project.settings.alerts;
  if (!alerts?.webhookUrl) return;
  const min = alerts.minSeverity ?? 'high';
  const qualifying = newGroups.filter((g) => RANK[g.severity] >= RANK[min]);
  if (!qualifying.length) return;

  const lines = qualifying.map((g) => `• [${g.severity.toUpperCase()}] ${g.title} (${g.detector})`);
  const text = `🔎 Snag — ${qualifying.length} new issue${qualifying.length === 1 ? '' : 's'} in *${project.name}*\n${lines.join('\n')}`;

  const body = JSON.stringify({
    text,
    project: project.name,
    projectId: project.id,
    sessionId: session.id,
    issues: qualifying.map((g) => ({
      title: g.title,
      severity: g.severity,
      detector: g.detector,
      occurrences: g.occurrences,
    })),
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch(alerts.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
  } catch (err) {
    console.error('[snag] alert webhook failed', err);
  }
}
