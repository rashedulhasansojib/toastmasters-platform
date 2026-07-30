/** A 409 from the org-unit delete route carries the relations standing in the way. */
export interface OrgUnitDeleteBlocker {
  relation: string;
  count: number;
}

function isBlockerList(value: unknown): value is OrgUnitDeleteBlocker[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as OrgUnitDeleteBlocker).relation === 'string' &&
        typeof (entry as OrgUnitDeleteBlocker).count === 'number',
    )
  );
}

/**
 * Turns an org-unit API error response into a sentence. Nest nests a
 * ConflictException's object payload one level down, under `message`, so the
 * blockers can arrive at either `body.blockers` or `body.message.blockers`.
 */
export async function describeOrgUnitFailure(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => ({}));
  const outer = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const inner =
    typeof outer.message === 'object' && outer.message !== null
      ? (outer.message as Record<string, unknown>)
      : {};

  const blockers = isBlockerList(inner.blockers)
    ? inner.blockers
    : isBlockerList(outer.blockers)
      ? outer.blockers
      : null;
  if (blockers?.length) {
    return `Not empty — still holds ${blockers.map((b) => `${b.count} ${b.relation}`).join(', ')}.`;
  }

  if (typeof outer.message === 'string') return outer.message;
  if (typeof inner.message === 'string') return inner.message;
  return `Request failed (${response.status})`;
}
