# Pre-existing integration failures — blocking the CI gate

**Recorded:** 2026-07-31 · **Status:** open · **Blocks:** enabling the `integration`
job in `.github/workflows/quality.yml`

`pnpm test:int` has never run in CI, so these accumulated unnoticed. The
containerised-deploy work added the suite to the gate, found them, and shipped
the job **disabled** rather than blocking every deploy on unrelated bugs.

## Not regressions

Both branches were run with identical environment and compared:

|                          | `main` | `deployment` branch                         |
| ------------------------ | ------ | ------------------------------------------- |
| Failing tests            | 10     | 9                                           |
| Introduced by the branch | —      | **none**                                    |
| Fixed by the branch      | —      | `system_admin · meeting.speech_slot:update` |

## Re-enabling

Everything needed is already in place and verified working:

- the `integration` job in `quality.yml`
- `pnpm test:int` → `turbo run test:int`
- placeholder S3 env in `quality.yml` **and** `passThroughEnv: ["S3_*"]` in
  `turbo.json` — both halves are required; the workflow alone has no effect,
  because Turbo runs tasks in a filtered environment

Flip `inputs.integration`'s default to `true` in `quality.yml` once the list
below is green. Runtime is ~4 minutes.

## The 9

| Spec file                      | Test                                                                                     | Observed                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------- |
| `access.seed`                  | is idempotent — running it twice produces no duplicates                                  | `expected 50 to be 47`                      |
| `agenda-print-http`            | (agenda content)                                                                         | rendered HTML did not contain `VPE Elev…`   |
| `education-progress-http`      | reports a started path with the catalogue as the denominator                             | object shape mismatch (`level`, `required`) |
| `invitation-http`              | rate-limits invitation creation per inviter per day                                      | —                                           |
| `meeting-guest-http`           | a VPE can assign a guest to a role, and the planner grid returns the guest identity      | —                                           |
| `meeting-role-assignment-http` | derives the fixed running order and slots the assigned role holder in                    | —                                           |
| `planner-http`                 | imports a sheet: schedules the meeting, assigns what resolves, lists the rest as pending | —                                           |
| `planner-http`                 | re-importing the same date matches the meeting and skips the filled slots                | —                                           |
| `planner-http`                 | never resolves a name to a member of another club                                        | —                                           |

`access.seed` looks like a stale assertion rather than a defect: it asserts
`resourceCatalog.count() === 47` and the seeded catalogue has since grown to 50.
Confirm the three additions are intended, then update the number.

The others need diagnosis before anyone can say whether the test or the
behaviour is wrong. `planner-http`'s "never resolves a name to a member of
another club" is worth looking at first — a cross-club name resolution is a
scope-isolation property, and CLAUDE.md treats sibling-club isolation as a
non-negotiable (`NFR-5`).

## Why this matters

Adding this suite immediately caught a real production bug: `system_admin` could
not edit or remove a speech slot, because `meeting.speech_slot` was granted
`update` on a role template without `update` being added to the resource
catalogue's `allowed_actions` — and `system_admin`'s resolution is synthesised
from that list. See
`docs/superpowers/specs/2026-07-31-container-deploy-design.md` §11.1.

The authorisation matrix inside this suite is what CLAUDE.md §7 calls "the single
most valuable suite in the project". It is currently not running.
