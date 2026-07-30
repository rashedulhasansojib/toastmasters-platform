import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/session-proxy';

export async function GET(): Promise<NextResponse> {
  const upstream = await authedFetch('/v1/role-templates');
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
