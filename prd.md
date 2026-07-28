# Product Requirements Document — Toastmasters Club Management Platform

**Version:** 1.0 · **Date:** 2026-07-27 · **Status:** For review
**Companion documents:** `system-design.md` (v2.0), `rbac-design.md`

> This PRD describes *what* the platform must do and *why*. It is deliberately implementation-free:
> schemas, algorithms, and technology choices live in the two design documents above, which this PRD
> references rather than repeats. Requirement IDs are stable and quotable (e.g. FR-FIN-2). Priorities:
> **P0** launch-blocking, **P1** required for full v1, **P2** deferred / post-v1.

---

## 1. Summary

A single web platform for running Toastmasters clubs and the district structure above them. It gives
every club officer a purpose-built home for their responsibilities — planning and running meetings,
tracking member education, working the guest pipeline, managing club-local finances, keeping records
and inventory — and gives Area, Division, and District leadership the oversight and reports they are
formally measured on.

The platform models the real Toastmasters hierarchy (District → Division → Area → Club → Member) so
that access and reporting follow organisational containment, and it is architected so that no data or
capability depends on any individual's continued tenure. The annual 1 July leadership handover, which
is the single most disruptive event in a volunteer organisation's year, becomes a data event rather
than a crisis.

Scope is a **single district, single deployment** running roughly 100 clubs and 3,000 people. The
platform complements Toastmasters International's (TI) own systems rather than replacing them: TI stays
authoritative for official membership, dues-to-headquarters, and education awards; the platform owns
everything about local club operation that TI does not provide.

---

## 2. Background and problem

Toastmasters clubs are run entirely by unpaid volunteer officers who rotate every year on 1 July. TI
provides authoritative systems for the things it must own centrally — membership of record, dues owed
to World Headquarters, and Pathways education awards — but provides **no tooling and no write API** for
the day-to-day operation of a club. As a result, clubs improvise: meeting agendas in word processors,
role rosters in spreadsheets, guest follow-up in chat groups, the treasury in a personal notebook, and
institutional knowledge in the memory of whoever currently holds the office.

This improvisation fails predictably in three ways.

**It does not survive the handover.** Every July, an outgoing officer's spreadsheets and undocumented
knowledge leave with them. The incoming Treasurer inherits an argument about what the club actually
has; the incoming Secretary inherits nothing; the incoming VP Education has no history of who has held
which meeting role. Continuity depends on goodwill and personal handoff, and often breaks.

**It leaves club leaders working blind or by hand.** Area and Division Directors are measured on
specific, TI-defined obligations — twice-yearly club visits with filed reports, monthly President
contact, the Distinguished Club Program (DCP), no net club loss — and today they assemble that picture
manually across many clubs, if at all.

**It cannot connect the pieces.** Meeting role fulfilment now gates Pathways education progression;
dues status determines club good standing which determines DCP eligibility; a guest's conversion
should trigger onboarding. When each concern lives in a separate spreadsheet, these connections are
lost, and clubs routinely miss recognition they had actually earned because nobody recorded a
qualifying fact.

The platform exists to give club operations a durable, shared, permission-aware home that reflects how
Toastmasters actually works, and to make the annual handover — and district-level oversight — first
class rather than afterthoughts.

---

## 3. Product principles

These ten principles are load-bearing. They constrain every requirement below and are the reason the
design looks the way it does.

1. **Identity, membership, and office are three separate things.** One human has one login, valid
   across every club and every office they hold, simultaneously and over time.
2. **Access follows the hierarchy.** Permission is scoped to a place in the org tree and inherits
   downward; an Area Director sees clubs beneath their area without anyone enumerating them.
3. **Time is a dimension.** Every operational record belongs to a program year; closing a year makes
   its records immutable; the year rolls over automatically.
4. **Facts are append-only.** Ledgers, audit events, attendance, votes, and inventory are corrected by
   new records, never overwritten.
5. **Nothing depends on tenure.** Roles expire with terms; history is retained; the handover loses no
   data and requires no manual archiving.
6. **TI is authoritative where TI is authoritative.** The platform mirrors and reconciles TI data
   through a human-mediated screen; it never presents its own figures as official and never blocks a
   workflow on unverifiable TI state.
7. **Default deny, one gate.** Absence of a grant is a refusal, and every access decision flows through
   a single authorisation check — not a dozen drifting ones.
8. **Meeting day is phone-first and offline-tolerant.** Timing, counting, and attendance survive
   venue wifi failure.
9. **Oversight sees aggregates, not individuals.** District-tier roles get counts and projections, not
   member names, dues status, or evaluation contents.
10. **Signals coach, they do not judge.** Member-health and officer-activeness measures are private
    support tools, never public labels or surveillance.

---

## 4. Goals and success metrics

### 4.1 Goals

| # | Goal |
|---|---|
| G1 | Run a club meeting end to end: agenda, roles, speeches, timing, evaluations, attendance, awards |
| G2 | Model the real TI hierarchy with permissions that follow containment |
| G3 | One login per human, valid across every club and office they hold |
| G4 | Survive the annual leadership handover with zero data loss and zero manual archiving |
| G5 | Give Area and Division leaders the compliance reports they are actually measured on |
| G6 | Track member education progress against Pathways requirements, including role fulfilment |
| G7 | Manage the guest-to-member funnel and club-local finances |
| G8 | Give every officer a working home for their own domain — records, resources, inventory, content |

### 4.2 Success metrics

Metrics are grouped as **adoption**, **outcome**, and **guardrail**. Targets are directional starting
points to be calibrated against a pilot.

**Adoption**
- Share of the district's clubs with the platform in active use (≥3 officers logging in monthly).
- Share of club meetings planned and closed out on the platform rather than off-platform.
- Officer onboarding-track completion rate within 30 days of a term start.

**Outcome**
- **Handover integrity:** after a 1 July rollover, 100% of the prior year's operational records remain
  queryable and correctly attributed; the incoming Treasurer receives a handover financial report with
  a trusted opening balance without manual reconciliation.
- **Oversight coverage:** Area visit-report compliance (the 75%-by-30-Nov and 75%-by-31-May thresholds)
  is visible as a live figure for every Area Director; DCP projection is available per club.
- **Education fidelity:** meeting-role fulfilment and level completions are tracked such that clubs stop
  losing DCP goals to unrecorded qualifying facts (measured as a reduction in "earned but unrecorded"
  discrepancies surfaced at reconciliation).
- **Meeting reliability:** speech timing and attendance captured on meeting day are never lost to a
  wifi drop (measured via idempotent replay success).
- **Retention action:** share of raised retention alerts that are acknowledged and actioned rather than
  ignored.

**Guardrail** (early-warning signals that the model is drifting)
- Count of direct person grants and per-unit overrides. A steadily climbing count means the role
  templates are wrong and people are papering over them; this should trend toward zero.
- Authorisation-denial spikes, which usually mean a permission change broke something real.
- Growth in unresolved TI reconciliation discrepancies.

---

## 5. Non-goals and out of scope

| # | Non-goal | Rationale |
|---|---|---|
| N1 | Replacing TI's Club Central or Base Camp | No TI write API; TI stays authoritative for membership, HQ dues, and education awards |
| N2 | Multi-tenant SaaS isolation | Single district, single deployment. Separation between clubs is authorisation, not tenancy (see §9 and open decision 10) |
| N3 | Speech-contest management | A distinct, seasonal domain with low reuse |
| N4 | Payment processing | The platform records payments; it does not take them. Removes PCI scope entirely |
| N5 | Direct social-media publishing | Per-platform OAuth and constant API churn is disproportionate for volunteer clubs; the platform plans and records posts instead |
| N6 | Video conferencing | The platform links out to existing tools |

Explicitly out of scope for v1 beyond the above: cross-district tenancy operations (per-tenant backup,
residency, billing, isolation), and any workflow that would depend on an automated two-way sync with
TI.

---

## 6. Users and personas

Two population classes: **authenticated users** (members and officers, one account per human) and
**guests** (attend and participate through single-purpose links, never authenticate, never get an
account).

### 6.1 Club-level personas

| Persona | Primary jobs | Key pain today |
|---|---|---|
| **Member** | See my next role; request a speech slot; read my evaluations; track my Pathways progress; pay dues; find a mentor | No single place to see obligations or progress; feedback is on paper |
| **VP Education (VPE)** | Fill meeting roles ahead of time; approve speech slots; confirm level completions; rotate roles fairly; assign mentors; run onboarding | Role planning and Pathways role-requirements tracked by hand |
| **VP Membership (VPM)** | Work the guest pipeline; convert prospects; act on at-risk members | Guest follow-up scattered across chats; no retention signal |
| **VP Public Relations (VPPR)** | Maintain the public page; plan content; manage media and links; learn which posts bring guests | No link between content and inbound prospects |
| **President** | Monitor club health and DCP; manage the officer roster; own the Club Success Plan; chair ExCom | DCP status assembled manually; plan is a September formality, not a live tool |
| **Secretary** | Record attendance; take ExCom and club minutes; keep the document archive | Minutes transcribed from scratch; archive is ad hoc |
| **Treasurer** | Track dues per period; keep the ledger; issue invoices; manage installments; produce reports | Treasury in a notebook; handover starts with an argument |
| **Sergeant at Arms (SAA)** | Meeting logistics and checklists; inventory; club costs | Inventory and custody untracked; kit location lost at handover |
| **Immediate Past President (IPP)** | Advisory continuity, read-mostly | No formal seat for institutional memory |

### 6.2 District-appointed, club-scoped personas

| Persona | Purpose |
|---|---|
| **Club Sponsor** | Helps organise and charter a brand-new club |
| **Club Mentor** | Supports a newly chartered club through its early months |
| **Club Coach** | Assigned by the Club Growth Director to rebuild a struggling club |

These operate **inside a single club** but are appointed by the district and are usually **not members**
of that club. They see club health, education aggregates, membership counts, DCP, and the Club Success
Plan; they do **not** see the ledger, individual dues, or evaluations.

### 6.3 Oversight personas

| Persona | Primary jobs |
|---|---|
| **Area Director** | Visit each club at least twice a year and file reports; contact Presidents monthly; hold Area Council meetings; defend the club count |
| **Division Director** | Roll up areas; assign clubs to areas; reassign Area Directors |
| **District Director / Trio (+ managers)** | District-wide oversight; officer roster; club growth; district finance and PR |

Oversight personas are **read-only into clubs** and see **aggregates, not member detail** (§ FR-OVS).

### 6.4 Platform personas

| Persona | Primary jobs |
|---|---|
| **Guest / Prospect** | Attend a meeting, fill a functionary role, register interest — without an account |
| **System Administrator** | Build the org tree; manage role templates; break-glass support; run rollover |
| **Unit Administrator** | Retune one unit's permissions within the bounds of what they themselves hold |
| **Support (read-only)** | Troubleshoot access without seeing ledger, evaluations, or health signals |

---

## 7. Domain concepts (product-level)

Just enough of the Toastmasters domain to read the requirements. Full ground truth is in
`system-design.md` §2.

- **Hierarchy.** District → Division → Area → Club → Member, modelled as one tree so that "everything
  beneath here" is a single scope check.
- **Program year.** 1 July – 30 June. Every operational record belongs to one. Terms, dues periods,
  training periods, visit rounds, and the Club Success Plan deadline all hang off it.
- **Dues.** International dues are semiannual (two periods per year), paid to TI by hard deadlines;
  clubs may also charge separate local dues. Standing depends on the current period, not a flag.
- **Meeting anatomy.** A structured meeting with defined roles (Toastmaster, prepared speakers,
  evaluators, Table Topics, Timer, Ah-Counter, Grammarian, SAA), producing an agenda, timing and
  language reports, evaluations, award ballots, and attendance.
- **Pathways.** TI's education program: each path has five levels; progressing a level now requires
  completing **designated meeting roles**, and Levels 3–5 require an Education Series presentation. This
  makes meeting-role tracking educationally load-bearing.
- **Distinguished Club Program (DCP).** Ten annual goals plus qualifying requirements (good standing;
  Club Success Plan submitted by 30 September) that determine a club's recognition level.
- **Distinguished Area Program.** The Area Director's measurable obligations, centred on the twice-yearly
  club visit report structured around the six "Moments of Truth."

---

## 8. Functional requirements

Each area opens with intent, then a requirement table, then acceptance notes for the requirements that
most need them. "Scope" throughout means a node in the org tree and everything beneath it, unless a
requirement says otherwise.

### 8.1 Identity, accounts, and invitations (FR-ACC)

**Intent:** one durable identity per human, decoupled from the clubs they belong to and the offices
they hold, so that dual membership, multiple concurrent offices, and the annual handover all work
without duplicate accounts.

| ID | Requirement | Priority |
|---|---|---|
| FR-ACC-1 | Each human has exactly one account, keyed by a globally unique email, valid across every club and office they hold | P0 |
| FR-ACC-2 | A person may hold membership in multiple clubs simultaneously (dual membership), each with its own standing | P0 |
| FR-ACC-3 | A person may hold multiple offices at once (e.g. Club VPE and Area Director), each a separate, independently scoped assignment | P0 |
| FR-ACC-4 | New users are brought in by email invitation carrying intent (unit, membership, roles); accepting creates a new identity or attaches to an existing one | P0 |
| FR-ACC-5 | An invitation that carries a role must pass the same delegation check as a direct grant; invitations are never a privilege-escalation path | P0 |
| FR-ACC-6 | A district can be bootstrapped top-down with no placeholder data and no retro-assignment: create the unit, invite a person with intent, they accept and set a password, membership and role activate | P0 |
| FR-ACC-7 | Directors of area/division/district must hold at least one active club membership; a missing membership is surfaced as a task on the person's own dashboard and a warning to the appointing authority — never as a login block or a silent auto-revocation | P0 |
| FR-ACC-8 | Sessions carry a permission-version counter, not an embedded permission set, so a grant change takes effect mid-session without requiring re-login, and access can be revoked | P0 |
| FR-ACC-9 | Switching the active unit re-issues the session and changes nothing else; the client can never assert its own unit | P0 |
| FR-ACC-10 | Invitation and capability tokens are stored hashed, always expire, are revocable, and are compared in constant time; invitation creation is rate-limited per inviter | P0 |

*Acceptance highlights.* FR-ACC-4: an unknown email creates a `Person`; a known email attaches the new
membership/role to the existing person, with no second account. FR-ACC-7: appointing a Director whose
only club membership later lapses raises a warning to the appointer and does **not** strip access.
FR-ACC-8: a President appoints a member as VPE and the new capability is usable by that member on their
next request without logging out.

### 8.2 Organisation and program year (FR-ORG)

**Intent:** one recursive org structure and an explicit program-year model, because scope checks are
prefix matches on the tree and continuity depends on years closing cleanly.

| ID | Requirement | Priority |
|---|---|---|
| FR-ORG-1 | The organisation is one tree spanning international → region → district → division → area → club; visibility of a subtree is a single query | P0 |
| FR-ORG-2 | A district-only deployment may root the tree at the district level; the region tier is optional | P0 |
| FR-ORG-3 | Units can be re-parented (a club moved between areas, a club reassigned); the move is transactional and rewrites the subtree, and it invalidates affected permission caches | P1 |
| FR-ORG-4 | Every operational record carries its program year; dashboards default to the current year with a selector | P0 |
| FR-ORG-5 | Closing a program year makes its records read-only, never deleted; this is how the handover guarantee is delivered structurally | P0 |
| FR-ORG-6 | The 1 July rollover is an automated job — closing the outgoing year, ending term-based roles, snapshotting outcomes, generating handover reports, opening the new year, seeding next year's plans, and enrolling incoming officers — not a task an officer must remember | P0 |
| FR-ORG-7 | Each club has a profile (schedule, format, venue, join URL, local dues, public page, configurable health thresholds) | P1 |
| FR-ORG-8 | Times are stored as UTC instants; club meeting times render in the club's local zone; TI dues deadlines are computed in Mountain Time; deadlines are never computed in the viewer's local zone | P0 |

<!-- FR-ORG-2: this deployment always roots at region (CLAUDE.md §2, Phase-0 decision 6) — the district-only mode described here isn't built. -->

*Acceptance highlights.* FR-ORG-5: after year close, an attempt to modify a record from that year is
rejected at the data layer. FR-ORG-6: rollover flags any club with no officers recorded for the new
year rather than failing silently.

### 8.3 Authorisation (FR-AUTHZ)

**Intent:** scoped, time-bound, delegable permissions with ownership conditions, resolved through one
gate, and — critically — explainable, because "why can/can't X do Y?" is the question the platform is
asked constantly. Full model in `rbac-design.md`.

| ID | Requirement | Priority |
|---|---|---|
| FR-AUTHZ-1 | A permission is a resource + action + condition, scoped to a node in the tree; the resource and action vocabularies are fixed, seeded reference data, not code | P0 |
| FR-AUTHZ-2 | Scope inherits downward: a grant at a node applies to that node and all descendants (prefix match); some roles are exact-node-only and must not reach descendants | P0 |
| FR-AUTHZ-3 | Ownership conditions restrict a grant to the target row: own record, assigned record, a party to the record, or a published record; this keeps the resource vocabulary small | P0 |
| FR-AUTHZ-4 | Roles are templates (data, editable by a system administrator without a deploy) applied as assignments bound to a person, a place, and a term | P0 |
| FR-AUTHZ-5 | Evaluation is **default deny**, with **deny always winning** over allow, so a unit can tighten as well as loosen its defaults | P0 |
| FR-AUTHZ-6 | All authorisation flows through a single check; permission logic never lives in route handlers or scattered conditionals | P0 |
| FR-AUTHZ-7 | Every access decision produces a human-readable reason, and the system can answer, per person: what can they do here, why can they see this, and who can see a given resource anywhere | P0 |
| FR-AUTHZ-8 | List endpoints filter at the query level by scope and condition; the system never fetches rows and discards them, which would leak through pagination counts | P0 |
| FR-AUTHZ-9 | A unit administrator can retune their unit's permissions, but only within the bounds of what they themselves hold, and can never remove the last unit administrator | P0 |
| FR-AUTHZ-10 | Per-unit overrides and direct person grants require a reason and, where temporary, an expiry; expired grants are inert at resolution | P0 |
| FR-AUTHZ-11 | Every grant change goes through an audited surface; no grant is ever hand-edited in the database | P0 |
| FR-AUTHZ-12 | Sensitive resources (ledger, evaluations, member health signals, audit) are never included in a wildcard grant, are logged on read, and are excluded from read-only support access by default | P0 |
| FR-AUTHZ-13 | Roles expire with their term; ended assignments grant nothing but are retained as history | P0 |
| FR-AUTHZ-14 | Guests are not a role and do not authenticate; they act through capability tokens (§8.6) | P0 |

*Acceptance highlights.* FR-AUTHZ-7 is a user-facing feature — an **access inspector** producing a
full decision trace (scope check, condition check, matched grant, and the evaluation path through every
role) — and it must ship in the same release as the permission engine, not be retrofitted. FR-AUTHZ-2:
a club Treasurer's grants apply to their club, not to a child node the club later gains. FR-AUTHZ-5: a
club override that denies ledger read to a role beats the template's allow.

### 8.4 Meeting operations (FR-MTG)

**Intent:** the core of the product (G1). Run a meeting from planning through close-out, where
close-out converts operational data into education credit and DCP contribution.

| ID | Requirement | Priority |
|---|---|---|
| FR-MTG-1 | The VPE can build a meeting: agenda, roles, speech slots, theme, venue, format, from templates | P0 |
| FR-MTG-2 | Meeting roles reference a person (member, cross-club member, or guest), not a typed name, enabling education credit, rotation fairness, cross-club logging, and reliable attendance | P0 |
| FR-MTG-3 | A member can request a speech slot; the system validates that the meeting is open, the slot is free, the project is next in the member's path, and prerequisite roles for the level are fulfilled; the VPE approves | P0 |
| FR-MTG-4 | The system suggests role assignments ranked by rotation staleness with the reason shown, as suggestions the VPE may override — never as automatic assignment | P1 |
| FR-MTG-5 | A multi-week planner lets clubs plan roles ahead; it is a projection over role assignments, not a separate store; spreadsheet import resolves names to people, with unmatched names becoming a pending list rather than silently-wrong data | P1 |
| FR-MTG-6 | Meeting day provides live timer, ah-counter, and grammarian tools; these plus checklist and attendance writes are offline-tolerant, client-id'd, idempotent, and replayed on reconnect | P0 |
| FR-MTG-7 | Award ballots (best speaker, table topics, evaluator, role player) can be opened per category; meeting-award votes are anonymous, one per eligible person; results are hidden from guests at the API layer | P1 |
| FR-MTG-8 | Meeting close-out is guarded (no unconfirmed roles remain), emits the events that drive education and DCP, revokes the meeting's capability tokens, and makes the meeting read-only | P0 |
| FR-MTG-9 | An incomplete meeting checklist warns at close-out but does not block; a meeting has ended whether or not the banner was put away | P1 |
| FR-MTG-10 | Reopening a closed meeting requires a reason, is audited, and is flagged thereafter | P1 |
| FR-MTG-11 | The system produces printable/exportable artefacts: agenda, timing report, ah-counter report, grammarian report | P1 |

*Acceptance highlights.* FR-MTG-2: three members with the same first name are unambiguous because roles
reference identity. FR-MTG-3: at request time the system can tell a member "serve as Timer once before
this level closes," rather than letting them discover the gap in June. FR-MTG-6: a wifi drop mid-meeting
does not lose a speech's timing.

### 8.5 Education and recognition (FR-EDU)

**Intent:** track Pathways progress against real TI rules, where meeting-role fulfilment gates level
progression and only VPE-confirmed completions count toward DCP.

| ID | Requirement | Priority |
|---|---|---|
| FR-EDU-1 | The path catalogue is seeded reference data, never a hardcoded list; the catalogue changes and must be editable | P1 |
| FR-EDU-2 | Level completion requires the level's designated meeting roles to be fulfilled, drawn from meeting close-out events, not self-report; Levels 3–5 additionally require an Education Series presentation | P1 |
| FR-EDU-3 | Level completion is two-step: the member marks complete, the VPE confirms; only the confirmed date feeds DCP | P1 |
| FR-EDU-4 | Evaluations support three modes — structured form, photo of a paper sheet, recorded audio — and snapshot the meeting's timing/ah-counter metrics at the moment of evaluation, so later corrections do not rewrite feedback | P1 |
| FR-EDU-5 | Evaluations are visible to the speaker and VPE only by default; an evaluation is feedback, not a club record | P0 |
| FR-EDU-6 | Mentorship pairings are supported with ranked suggestions (never automatic pairing), goals, and check-in history; ending a pairing never deletes its history; mentors see mentees' goals but not their evaluations | P1 |
| FR-EDU-7 | Onboarding tracks exist for new members and new officers, auto-enrolled on the relevant events (guest converted, officer assigned, program year rolled); officer tracks are handover checklists whose progress is visible to the President | P1 |

*Acceptance highlights.* FR-EDU-7 is what makes the handover survivable and must exist **before** the
first July the club runs through the system, not in response to a struggling cohort. FR-EDU-4: a timer
correction after the fact does not silently alter a submitted evaluation's recorded metrics.

### 8.6 Membership and prospects (FR-MEM)

**Intent:** own the guest-to-member funnel and give VPMs a private, actionable retention signal.

| ID | Requirement | Priority |
|---|---|---|
| FR-MEM-1 | Prospects are club-local, non-authenticating, and VPM-owned, with visit and communication history and a lead source | P0 |
| FR-MEM-2 | Converting a prospect creates or attaches a person, creates a club membership, links the prospect, and enrols the new member in onboarding; a guest already belonging to another club never receives a second identity | P0 |
| FR-MEM-3 | Prospect PII has an enforced retention window (`deleteAfter`), not an aspirational one | P0 |
| FR-MEM-4 | A single capability-token primitive covers every guest interaction (register interest, view agenda, fill a role, vote, submit an evaluation, view a gallery); tokens are hashed, expiring, revocable, and revoked at meeting close | P0 |
| FR-MEM-5 | Member health is computed as a private signal (attendance, roles, speeches, dues, recency) banded healthy/watch/at-risk/disengaged, visible only to VPM, President, and the member's mentor — never to the whole club and never shown to the member as a label | P1 |
| FR-MEM-6 | Retention alerts are a nudge list with a suggested owner and an action log, resolvable with an outcome; band thresholds are club-configurable | P1 |
| FR-MEM-7 | Lead source ties an inbound prospect back to the content post that brought them, so the VPPR learns which posts work | P1 |

*Acceptance highlights.* FR-MEM-5 explicitly forbids a member-facing "score." The useful output is
"call Fatima, we haven't seen her in seven weeks," not a label on her profile.

### 8.7 Finance (FR-FIN)

**Intent:** record (never process) club-local money with the integrity an incoming Treasurer and an
auditor both need. Per-period dues, an append-only ledger, gapless invoicing, installments, and a
trustworthy handover report.

| ID | Requirement | Priority |
|---|---|---|
| FR-FIN-1 | The platform records payments; it never takes them (no payment processing, no PCI scope) | P0 |
| FR-FIN-2 | The financial ledger is append-only; corrections are reversing entries; no posted entry is ever edited or deleted | P0 |
| FR-FIN-3 | Dues are tracked per membership per period, not as a single status flag; member standing is derived from the current period's record by an explicit handler, not implicit database middleware | P0 |
| FR-FIN-4 | Invoices are numbered gaplessly per club per program year, generated as a PDF, and emailed; line items link to dues records so reconciliation is automatic | P1 |
| FR-FIN-5 | Invoices are never edited after issue; corrections are credit notes referencing the original | P1 |
| FR-FIN-6 | Installment plans cover local dues only; the plan's scheduled amounts must sum to its total; because international dues must reach TI in full by the deadline, a plan spanning that date must front-load the TI portion, and this must be explicit in the UI; a missed installment raises a reminder, not an automatic suspension | P1 |
| FR-FIN-7 | Financial reports are frozen snapshots (stored figures + PDF), not saved queries; re-running an approved report later produces the same numbers even after a backdated correction | P1 |
| FR-FIN-8 | A handover financial report is generated automatically at term end, giving the incoming Treasurer a trusted opening balance and the outgoing one a clean discharge | P0 |

*Acceptance highlights.* FR-FIN-2: the "delete" affordance remains but writes a reversal. FR-FIN-4:
concurrent invoice creation never produces a gap or a duplicate number.

### 8.8 Governance and records (FR-GOV)

**Intent:** ExCom meetings, motions with attributable votes, self-drafting minutes approved at the next
meeting, and a Club Success Plan that is a live document rather than a September formality.

| ID | Requirement | Priority |
|---|---|---|
| FR-GOV-1 | ExCom meetings capture attendees, quorum determination, agenda, and motions | P2 |
| FR-GOV-2 | Motions record mover, seconder, discussion, and an **attributable** vote (each voter's choice named) and outcome; a carried motion with an effective date can drive downstream action | P2 |
| FR-GOV-3 | Minutes draft themselves from the agenda, attendee list, quorum, and motion outcomes; the Secretary writes narrative, not transcription | P2 |
| FR-GOV-4 | Minutes are approved at the *next* meeting; approved minutes are immutable, and a correction is a new version linked to the prior one | P2 |
| FR-GOV-5 | Published minutes land in the library automatically as governance documents | P2 |
| FR-GOV-6 | The Club Success Plan captures per-DCP-goal targets, owners, strategies, and milestones, and renders against the live DCP projection on one screen; rollover seeds next year's draft from this year's outcome | P1 |

*Note.* Governance votes are attributable by design (accountability matters); meeting-award ballots are
anonymous (a social ritual). These are different activities with different rules — see FR-MTG-7.

### 8.9 Club operations (FR-OPS)

**Intent:** give the SAA a working home — meeting checklists tied to the meeting lifecycle, and
inventory whose custody survives the handover.

| ID | Requirement | Priority |
|---|---|---|
| FR-OPS-1 | Meeting checklist templates (before/during/after, with an owner role) instantiate a run on meeting publish and surface at the right lifecycle phase | P1 |
| FR-OPS-2 | Inventory quantity is derived from an append-only movement log, not stored independently | P1 |
| FR-OPS-3 | Inventory records custody (who holds each item, where), so an incoming SAA can locate the banner at the outgoing SAA's house | P1 |
| FR-OPS-4 | Acquisitions can link an inventory item to the ledger entry that paid for it | P1 |

### 8.10 Library and communications (FR-LIB)

**Intent:** one library with many views, because six other contexts need to attach files. Content is
planned but not published directly (N5).

| ID | Requirement | Priority |
|---|---|---|
| FR-LIB-1 | Documents, media, links, and notes are one model with filtered views (document archive, media library, links, resources), not four stores | P1 |
| FR-LIB-2 | Governance documents are versioned, never overwritten; "what did the bylaws say when that motion passed?" is answerable | P1 |
| FR-LIB-3 | Library items carry a review date; a periodic job lists items past review for the owning officer, preventing rot | P1 |
| FR-LIB-4 | Media attached to a meeting inherits the meeting's visibility — no second permission decision | P1 |
| FR-LIB-5 | Uploads are served only via signed URLs, never from the app origin | P0 |
| FR-LIB-6 | Published minutes and final financial reports land in the library automatically | P1 |
| FR-LIB-7 | The content planner schedules posts referencing library assets and ties a lead-source tag back to inbound prospects; it plans and records only — no direct publishing | P1 |

### 8.11 Quality and oversight — area, division, district (FR-OVS)

**Intent:** give oversight roles exactly what they are measured on, and nothing more. The defining
constraint is that oversight sees aggregates, never member detail.

| ID | Requirement | Priority |
|---|---|---|
| FR-OVS-1 | Tickets are collaborative (any tagged party may resolve), tag **roles as well as people** so they stay correctly addressed after a handover, and are visible to any principal whose scope prefixes the ticket's unit — giving Directors jurisdiction-wide visibility as a derived consequence | P1 |
| FR-OVS-2 | Area visit reports are structured around the six Moments of Truth, one per club per round; the President contact log records monthly contact | P1 |
| FR-OVS-3 | Area/division/district roles are read-only into clubs and see **aggregate counts and projections, not** member names, dues status, or evaluation contents; a district officer needing member detail must be granted a visible, auditable club-tier role | P0 |
| FR-OVS-4 | The Program Quality / Club Growth split is reflected in permissions: PQ roles get education aggregates and Club Success Plans; CG roles get club creation and coach appointment | P1 |
| FR-OVS-5 | A DCP projection is computed nightly per club, each goal traceable to its contributing records, and is always labelled "Projected — official status from TI" | P1 |
| FR-OVS-6 | The Area dashboard leads with **visit compliance** (R1/R2 filed per club against the 75% thresholds), not attendance charts; an Area dashboard that shows attendance but not visit compliance has missed the job | P1 |
| FR-OVS-7 | Directors can create and re-parent units within their authority and appoint roles below their tier, bounded by the delegation rules | P1 |

### 8.12 Cross-club support (FR-SUP)

**Intent:** let members opt in to help nearby clubs needing a functionary or mentor, with a privacy
posture strong enough that coarse location data cannot be repurposed.

| ID | Requirement | Priority |
|---|---|---|
| FR-SUP-1 | Discoverability is opt-in (default off), separately consented, and versioned | P2 |
| FR-SUP-2 | Location is stored only as a coarse geohash (~±2.4 km), never raw coordinates; requesters see a distance band, not a pin | P2 |
| FR-SUP-3 | An accepted support request creates a cross-club meeting role with function-scoped visibility for that meeting only; the external member earns no education credit (TI credit is club-scoped) but the participation is logged | P2 |

### 8.13 TI integration boundary (FR-TI)

**Intent:** a clean, field-level system-of-record split, with reconciliation as a human-mediated screen
rather than an automated sync.

| ID | Requirement | Priority |
|---|---|---|
| FR-TI-1 | TI is authoritative for member number/join date/type, international dues and good standing, Pathways/DTM awards, official DCP status, and officer-list submission; the platform mirrors these fields with provenance and last-reconciled timestamps | P0 |
| FR-TI-2 | The platform is authoritative for meetings, roles, attendance, evaluations, timing, local finances, prospects, tickets, minutes, library, and inventory | P0 |
| FR-TI-3 | Reconciliation is a screen — import a Club Central export, diff against local state, a human resolves discrepancies — never a background sync | P1 |
| FR-TI-4 | The platform never presents a computed DCP status as official, and no workflow blocks on unverifiable TI state | P0 |

---

## 9. Non-functional requirements (NFR)

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Scale | ~100 clubs × ~30 members ≈ 3,000 people; ~5,000 meetings/year. Optimise for correctness, not throughput |
| NFR-2 | Availability | 99.5% overall; weekday-evening meeting windows are the only critical periods |
| NFR-3 | Meeting-day resilience | Timer, ah-counter, grammarian, checklist, and attendance writes work offline, are idempotent, and replay on reconnect without duplication |
| NFR-4 | Data integrity | Ledgers, audit events, attendance, votes, and inventory movements are append-only and enforced as such at the data layer, not by convention |
| NFR-5 | Authorisation correctness | A principal with no grant on a club cannot read that club's data, verified by a generated (role × resource × action × scope) test matrix — the single most valuable test suite in the project |
| NFR-6 | Auditability | Every state-changing action and every break-glass access writes an immutable audit event with actor, target, and before/after diff; the audit log cannot be rewritten by the application |
| NFR-7 | Security | Argon2id passwords with breach-list check; TOTP MFA optional for members and **required for system administrators**; httpOnly/Secure/SameSite sessions revocable via permission version; HTTPS/HSTS; parameterised queries only; upload type/size validation and virus scanning; signed-URL storage |
| NFR-8 | Privacy | Per-person export and deletion, where deletion **anonymises** ledger/invoice/minutes/audit records rather than removing them (financial and governance integrity outrank erasure); coarse, opt-in, separately consented location; evaluations and health signals restricted by default; prospect PII auto-expires |
| NFR-9 | Accessibility | WCAG 2.2 AA; meeting-day tools use large touch targets and high contrast (used standing, on a phone, in a dim room) |
| NFR-10 | Reliability & recovery | Nightly full backup + point-in-time recovery; RPO 1 hour, RTO 4 hours; restore tested quarterly |
| NFR-11 | Observability | Structured logs with correlation ids; metrics on authorisation denials, job failures, token redemptions, login failures, and PDF generation; alerts on projection/snapshot/signal job failure, path-consistency failure, inventory drift, denial spikes, and email failure |
| NFR-12 | Notifications | Sensible day-one defaults per event; **digest by default for anything director-tier**, so a multi-club Director is not driven to switch notifications off and become unreachable |
| NFR-13 | Configurability | Per-unit feature flags so a pilot club can trial a capability before district rollout |

---

## 10. Constraints and assumptions

- **No TI write API.** All TI data arrives by manual entry or CSV import; the boundary in §8.13 is a
  hard constraint, not a preference.
- **Volunteer users who rotate annually.** Every workflow must be learnable in one sitting; nothing may
  depend on a person's continued tenure.
- **Meeting-day conditions.** Tools run on phones on unreliable venue wifi.
- **Single district, single deployment.** Separation between clubs is authorisation, not tenancy. If
  this assumption changes, decide the tenancy model *before* production data exists (open decision 10).
- **Fixed vocabularies as data.** Resources, actions, paths, DCP goals, role templates, and evaluation
  criteria are seeded reference data, editable without a deploy — not code.

---

## 11. Release plan

Milestones are dependency-ordered; each ends in something demonstrable. Full contents in
`system-design.md` §24.

| # | Milestone | Delivers | Demo |
|---|---|---|---|
| **M1** | Walking skeleton | Org tree + program year + identity/membership/role + login + one authorisation gate + seeds + one meeting | A President creates a meeting and assigns a VPE; a member of another club cannot see it |
| **M2** | Identity & org | Invitations with delegation checks, unit policies, permission versioning, org tree editor, unit switcher, audit emission | A district is built top-down by invitation |
| **M3** | Meeting operations | Full meeting aggregate, agenda/templates, slot approval, printable agenda, live meeting tools, rotation suggestions, checklists, capability tokens, ballots, close-out | Run a real club meeting on the platform |
| **M4** | Members & money | Prospect pipeline, conversion, per-period dues, append-only ledger, invoices, installments, financial reports, public pages | A guest attends, converts, is invoiced, and pays |
| **M5** | Club operations | Library (with versioning and review dates), inventory, content planner | Every officer has a working home for their module |
| **M6** | Area tier | Area visit reports, visit-compliance dashboard, President contact log, Club Success Plan, tickets, health snapshots | An Area Director runs their year |
| **M7** | Education | Education records, level confirmation, role-requirement checking, evaluations, mentorship, onboarding tracks | A member completes a level; the VPE confirms; a new member is paired and onboarded |
| **M8** | Governance & oversight | ExCom meetings, motions, minutes, DCP projection, division roll-up, member health signals, cross-club support, activeness scoring | Full ExCom cycle; district-level oversight |

**Suggested v1 cut line: M1–M6.** That ships per-person login, correct hierarchy with working
delegation, full meeting operations, guests, dues, treasury, invoicing, every officer's module home,
tickets, and an Area dashboard.

**Two sequencing decisions worth defending:**
- **The library is M5, not M8**, because six later contexts need to attach files; building it late
  means retrofitting attachment points everywhere.
- **Onboarding tracks land before the first July** run through the system, because the officer-handover
  track must exist *before* the cohort that needs it, not in response to it struggling.

**M1 is deliberately tiny** and exists to make the permission model hurt at four routes rather than
forty. If the authorisation gate feels awkward there, fix it before M2.

---

## 12. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Permission model proves awkward in practice | High | M1 surfaces it at four routes before it spreads to forty |
| Storage/model choice regretted after schemas exist | High | Decide before M1 (open decision 1) |
| Reference data hardcoded out of habit | Medium | Paths, DCP goals, and role templates are seeded collections from M1 |
| Library built late and retrofitted everywhere | Medium | M5, before education and governance |
| Platform DCP figures disagree with TI's | Medium | Always labelled a projection; TI stays authoritative |
| Health / activeness signals read as surveillance | Medium | Private by default, band-only upward, shipped after calibration |
| Prospect PII accumulates | Medium | Enforced retention window in the first schema |
| Offline meeting writes lost | Medium | Idempotency keys and replay queue from M3 |
| Invoice sequence gaps | Low | Locked sequence + gap-detection job |

---

## 13. Open decisions

These block or shape work and need an owner. Several are far cheaper to decide before production data
exists. Full context in `system-design.md` §25.

| # | Decision | Why it matters now |
|---|---|---|
| 1 | Relational (PostgreSQL) or a document store | Expensive to reverse after schemas exist; several invariants are cheapest enforced by the database |
| 2 | Ballot anonymity — anonymous or attributable | The two cannot coexist; changes the vote model |
| 3 | Club-creation authority — must a platform club map to a chartered TI club with a number? | Affects validation and the org tree editor |
| 4 | Prospect retention window | Needed for enforced PII expiry in the first schema |
| 5 | Audit retention period | Drives storage planning and the privacy notice |
| 6 | Does the district need a Region tier above District? | Free now, awkward to insert later |
| 7 | Local dues model — flat semiannual, monthly, or per-club configurable | Affects dues records and proration |
| 8 | Are installment plans permitted at all, and who approves them | Affects the Treasurer workflow |
| 9 | Minutes default visibility — officers, members, or public | Affects governance and the library archive |
| 10 | Single district or many? If many, row-level tenancy vs database-per-district | Structurally free either way; operationally expensive to retrofit |

---

## Appendix A — Glossary

| Term | Meaning |
|---|---|
| **DCP** | Distinguished Club Program — ten annual goals determining a club's recognition level |
| **DTM** | Distinguished Toastmaster — the highest education award |
| **Base Camp** | TI's learning-management system for Pathways |
| **Club Central** | TI's club-administration portal |
| **Pathways** | TI's education program; five levels per path, with designated meeting-role requirements |
| **Moments of Truth** | Six club-quality standards used in Area visit reports |
| **Program year** | 1 July – 30 June; the unit of time everything hangs off |
| **Club base** | Number of clubs in an area/division/district at year start |
| **ExCom** | Club Executive Committee |
| **Functionary** | Supporting meeting roles: Timer, Ah-Counter, Grammarian |
| **Dual member** | A person holding membership in two or more clubs |
| **Good standing** | ≥8 paid members (≥3 renewing); the eligibility floor for recognition |
| **Capability token** | A single-purpose, expiring, revocable link that lets a guest act without an account |
| **Break-glass** | Audited system-administrator bypass of normal permission checks |

## Appendix B — Traceability

This PRD is derived from and traceable to the two design documents. Functional areas map as follows:

| PRD area | Design reference |
|---|---|
| FR-ACC, FR-ORG | `system-design.md` §5–6 |
| FR-AUTHZ | `system-design.md` §7 + `rbac-design.md` (whole document) |
| FR-MTG | `system-design.md` §9 |
| FR-EDU | `system-design.md` §10 |
| FR-MEM | `system-design.md` §11 |
| FR-FIN | `system-design.md` §12 |
| FR-GOV | `system-design.md` §13 |
| FR-OPS | `system-design.md` §14 |
| FR-LIB | `system-design.md` §15 |
| FR-OVS | `system-design.md` §16, §22 |
| FR-SUP | `system-design.md` §17 |
| FR-TI | `system-design.md` §18 |
| NFR-1…13 | `system-design.md` §23 |
| Release plan, risks, open decisions | `system-design.md` §24–25 |
