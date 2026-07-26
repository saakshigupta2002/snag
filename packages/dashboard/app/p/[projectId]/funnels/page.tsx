import { redirect } from 'next/navigation';

// Funnels moved into Settings (a focused tab), reframed around drop-off replays.
// Keep this route so old links and bookmarks still land in the right place.
export default async function FunnelsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/p/${projectId}/settings?tab=funnels`);
}
