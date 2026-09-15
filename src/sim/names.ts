/**
 * The co-founder's names and voice. Plan §7 T2.
 *
 * Fleet names, roles, workload templates and the notes the co-founder left
 * behind. Pure data: the generator (`world.ts`) reads it, nothing writes it.
 *
 * Notes are private, dry and dated `MM-DD`. They never address the player
 * (no second person, no "operator", no "player"), and carry no emoji.
 */
import type { CoFounderNote, FleetFamily, Tier } from './types';

/** The order families appear in `fleetOrder`. */
export const FAMILY_ORDER: readonly FleetFamily[] = ['ingest', 'summarizer', 'monitor', 'relay', 'ledger'];

/**
 * Name pools per family. Fixed names come first (see `FIXED_FLEET_NAMES`);
 * the generator always allocates those, then fills from the rest.
 */
export const FLEET_NAME_FAMILIES: Record<FleetFamily, readonly string[]> = {
  // rivers
  ingest: [
    'danube', 'volga', 'tigris', 'mekong', 'orinoco', 'yukon', 'rhone',
    'indus', 'zambezi', 'ob', 'lena', 'severn', 'tagus', 'murray',
  ],
  // two fixed, then winds
  summarizer: [
    'summarizer-east', 'summarizer-west',
    'mistral', 'sirocco', 'chinook', 'zephyr', 'bora', 'foehn', 'harmattan', 'pampero',
  ],
  // one fixed, then lighthouses
  monitor: [
    'halberd-monitor',
    'fastnet', 'eddystone', 'skerryvore', 'bishop-rock', 'longships', 'wolf-rock', 'bell-rock', 'portland',
  ],
  // two fixed, then birds
  relay: [
    'comms-relay', 'secondary-runner',
    'heron', 'kestrel', 'plover', 'curlew', 'sandpiper', 'gannet', 'tern', 'shrike',
  ],
  // mountains
  ledger: ['aran', 'cuillin', 'torridon', 'snowdon', 'helvellyn', 'cadair', 'pentland', 'cheviot'],
};

/** Names the generator always allocates (they are the first entries of their pools). */
export const FIXED_FLEET_NAMES: readonly string[] = [
  'summarizer-east', 'summarizer-west', 'halberd-monitor', 'comms-relay', 'secondary-runner',
];

export const ROLE_BY_FAMILY: Record<FleetFamily, string> = {
  ingest: 'file ingest',
  summarizer: 'ticket summarisation',
  monitor: 'alert monitoring',
  relay: 'message relay',
  ledger: 'reconciliation',
};

/** halberd-monitor's role is named for its account (plan §7 T2 step 3). */
export const HALBERD_ROLE = 'trading-ops · Halberd Capital';

export interface WorkloadTemplate {
  name: string;
  inTokMean: number;
  outTokMean: number;
  /** The tier that passes the eval. Every trivial template is 'small' (plan §7 T2). */
  minTier: Tier;
  businessHours: boolean;
  /** Relative demand weight within a fleet. */
  share: number;
}

/**
 * Workload templates per family, spanning trivial / standard / heavy
 * (size class by `inTokMean + outTokMean`: ≤ 500 trivial, ≤ 4000 standard,
 * else heavy). Authored at ≈ 80/20 in/out so the healthy out-fraction target
 * is reachable; each family keeps one leaner and one richer template so the
 * generator can hit the fraction exactly by re-weighting.
 *
 * Invariant (tested): every template whose mean total is ≤ the trivial
 * maximum has `minTier: 'small'`, so a global `trivial → small` rule can
 * never under-tier. Heavy templates keep honest `minTier` values.
 */
export const WORKLOAD_TEMPLATES: Record<FleetFamily, readonly WorkloadTemplate[]> = {
  ingest: [
    { name: 'doc-classify', inTokMean: 240, outTokMean: 40, minTier: 'small', businessHours: false, share: 0.35 },
    { name: 'doc-extract', inTokMean: 1500, outTokMean: 500, minTier: 'small', businessHours: false, share: 0.3 },
    { name: 'doc-normalise', inTokMean: 2400, outTokMean: 600, minTier: 'medium', businessHours: false, share: 0.2 },
    { name: 'doc-reconcile', inTokMean: 6000, outTokMean: 2000, minTier: 'medium', businessHours: false, share: 0.15 },
  ],
  summarizer: [
    { name: 'thread-digest', inTokMean: 400, outTokMean: 80, minTier: 'small', businessHours: true, share: 0.35 },
    { name: 'meeting-notes', inTokMean: 2400, outTokMean: 800, minTier: 'small', businessHours: true, share: 0.25 },
    { name: 'report-brief', inTokMean: 3000, outTokMean: 600, minTier: 'medium', businessHours: true, share: 0.25 },
    { name: 'contract-abstract', inTokMean: 7000, outTokMean: 1400, minTier: 'medium', businessHours: false, share: 0.15 },
  ],
  monitor: [
    { name: 'alert-triage', inTokMean: 320, outTokMean: 60, minTier: 'small', businessHours: false, share: 0.4 },
    { name: 'log-anomaly', inTokMean: 1800, outTokMean: 450, minTier: 'small', businessHours: false, share: 0.25 },
    { name: 'incident-summary', inTokMean: 2800, outTokMean: 900, minTier: 'medium', businessHours: false, share: 0.2 },
    { name: 'runbook-check', inTokMean: 5200, outTokMean: 1000, minTier: 'medium', businessHours: false, share: 0.15 },
  ],
  relay: [
    { name: 'message-route', inTokMean: 200, outTokMean: 40, minTier: 'small', businessHours: true, share: 0.4 },
    { name: 'reply-draft', inTokMean: 1200, outTokMean: 400, minTier: 'small', businessHours: true, share: 0.25 },
    { name: 'thread-merge', inTokMean: 3000, outTokMean: 700, minTier: 'medium', businessHours: true, share: 0.2 },
    { name: 'escalation-brief', inTokMean: 6400, outTokMean: 1600, minTier: 'medium', businessHours: false, share: 0.15 },
  ],
  ledger: [
    { name: 'entry-match', inTokMean: 300, outTokMean: 50, minTier: 'small', businessHours: true, share: 0.35 },
    { name: 'invoice-parse', inTokMean: 1600, outTokMean: 400, minTier: 'small', businessHours: false, share: 0.25 },
    { name: 'statement-reconcile', inTokMean: 3200, outTokMean: 800, minTier: 'medium', businessHours: true, share: 0.25 },
    { name: 'audit-narrative', inTokMean: 6000, outTokMean: 1800, minTier: 'medium', businessHours: false, share: 0.15 },
  ],
};

/** The idle rivers' single workload (plan §3.5 c). */
export const IDLE_WORKLOAD_TEMPLATE: WorkloadTemplate = {
  name: 'trickle-ingest', inTokMean: 240, outTokMean: 40, minTier: 'small', businessHours: false, share: 1,
};

/** Bleed A's two trivial workloads, jobs split by `bleedA.split` (plan §3.5 a). */
export const BLEED_A_WORKLOAD_NAMES: readonly string[] = ['ticket-summary', 'ticket-triage'];
/** Bleed B's one heavy workload (plan §3.5 b). */
export const BLEED_B_WORKLOAD_NAME = 'watch-positions';

/** Canonical lines, verbatim (plan §7 T2). Tests check these exact strings. */
export const CANONICAL_NOTES = {
  tiering: "summarizer-east is on the big model because I never got around to the eval. Don't let it stay that way.",
  retryStorm: "If halberd-monitor pages twice in an hour it's the retry loop again. Circuit-break it and go back to bed.",
  ingest: 'Renamed the ingest fleets after rivers. Sorry. It was late.',
} as const;

export interface NoteBook {
  general: readonly CoFounderNote[];
  tiering: readonly CoFounderNote[];
  retryStorm: readonly CoFounderNote[];
  /** The last one trails off. */
  idle: readonly CoFounderNote[];
  /** The first note of each family is pinned to that family's first fleet. */
  byFamily: Record<FleetFamily, readonly CoFounderNote[]>;
}

export const NOTES: NoteBook = {
  general: [
    { date: '02-03', text: 'Moved the slot reservations to a monthly commit. Cheaper per hour, dearer to forget.' },
    { date: '02-11', text: 'Three tiers. S for anything a tired intern could do, M for the rest, XL only when the eval says so.' },
    { date: '02-19', text: 'Every fleet serves somebody. Pausing one is not free; the contracts have a 24 h backlog clause.' },
    { date: '02-26', text: 'Concurrency is the reserved slot count. It is billed whether the slots run or sit.' },
    { date: '03-04', text: 'Backoff on by default now. The one fleet without it is a story for later.' },
    { date: '03-09', text: 'Token cost is prompt plus output. Output is four times dearer; short answers are the cheapest lever nobody pulls.' },
    { date: '03-14', text: 'Dashboards read from the ledger, not from what anyone hopes is happening. Keep it that way.' },
    { date: '03-18', text: 'Wrote the routing rules down. Lowest priority number wins; ties go alphabetically. Boring on purpose.' },
    { date: '03-22', text: 'Weekend traffic is about seventy percent of weekday. The ingest rivers do not notice weekends.' },
  ],
  tiering: [
    { date: '02-14', text: CANONICAL_NOTES.tiering },
    { date: '03-01', text: 'Ran the numbers on the summariser once. Two hundred tokens a job. Left the rule in anyway. Not proud.' },
  ],
  retryStorm: [
    { date: '03-11', text: CANONICAL_NOTES.retryStorm },
    { date: '03-19', text: 'Five attempts, no backoff, no breaker. It was a demo setting. The demo was in January.' },
  ],
  idle: [
    { date: '02-08', text: 'Provisioned the river fleets for the migration. Eighty-eight hundred slots each. The migration finished in March.' },
    { date: '02-22', text: 'Scale-to-zero exists. Never turned it on for the rivers because the first cold start took ninety seconds and someone complained.' },
    { date: '03-25', text: 'Meant to go through the rivers one by one and' },
  ],
  byFamily: {
    ingest: [
      { date: '01-27', text: CANONICAL_NOTES.ingest },
      { date: '02-15', text: 'Ingest runs around the clock. The files arrive whenever the customers upload them.' },
      { date: '03-06', text: 'Classification is trivial work. Extraction is not. They share a fleet because splitting them was a Friday job.' },
    ],
    summarizer: [
      { date: '01-30', text: 'Summariser fleets are named after winds, except the two that were named before the naming scheme.' },
      { date: '02-20', text: 'Ticket volume follows office hours. Provisioned for the afternoon peak, which is the honest number.' },
      { date: '03-12', text: 'Contract abstracts need the mid model. Everything else in the summariser family passes on S.' },
    ],
    monitor: [
      { date: '02-01', text: 'Monitors are lighthouses. They watch, they page, they are not supposed to think much.' },
      { date: '02-24', text: 'Alert triage is a few hundred tokens. If a monitor fleet costs real money it is retrying, not reasoning.' },
      { date: '03-15', text: 'Error budget is failed jobs over the week against half a percent. Burning it is normal; burning it ten times over is a page.' },
    ],
    relay: [
      { date: '02-05', text: 'Relay fleets are birds. comms-relay and secondary-runner predate the birds and refused to be renamed.' },
      { date: '02-27', text: 'Relay traffic is business hours. Escalation briefs are the exception; those come in at 3 a.m. like everything urgent.' },
      { date: '03-16', text: 'Message routing is the cheapest work in the company per job and the most expensive per mistake.' },
    ],
    ledger: [
      { date: '02-09', text: 'Ledger fleets are mountains. Reconciliation should feel like one.' },
      { date: '03-02', text: 'Statement reconciliation passes the eval on M. Audit narratives too, on a good day.' },
      { date: '03-20', text: 'Month-end doubles the ledger load for two days. Not modelled; the headroom absorbs it.' },
    ],
  },
};
