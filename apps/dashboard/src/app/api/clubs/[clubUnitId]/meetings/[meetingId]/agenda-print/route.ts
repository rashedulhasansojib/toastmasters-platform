import { authedFetch } from '@/lib/session-proxy';

/** M3 Slice 12: the API renders raw print-ready HTML (no Zod contract, no PDF dependency) — this proxy just forwards bytes and content-type, same auth-forwarding role as every other route here. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clubUnitId: string; meetingId: string }> },
): Promise<Response> {
  const { clubUnitId, meetingId } = await params;
  const upstream = await authedFetch(`/v1/clubs/${clubUnitId}/meetings/${meetingId}/agenda/print`);
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'text/html; charset=utf-8' },
  });
}
