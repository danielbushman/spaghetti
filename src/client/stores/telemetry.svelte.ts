/**
 * Fake-but-believable telemetry for the side column.
 *
 * Two pieces:
 *   - `signals`: a small set of numeric streams that tick every 600ms with
 *     a mean-reverting random walk. While anything in the status panel is
 *     red, we inject a positive bias so the sparklines visibly "feel" the
 *     incident.
 *   - `statusItems`: a list of component health rows. Revealed by
 *     `revealStatus()` with a stagger, picked via `startFixing(id)`, and
 *     resolved with `completeFix(id)`.
 *
 * No real backend yet — this is a stage for the awakening scene. When real
 * orchestration lands, the same shape can be fed by it.
 */

export type Signal = {
  id: string;
  label: string;
  unit: string;
  history: number[];
  current: number;
  min: number;
  max: number;
};

export type StatusState = "red" | "yellow" | "green" | "working";

export type StatusItem = {
  id: string;
  label: string;
  hint: string;
  state: StatusState;
};

const HISTORY_LEN = 32;
const TICK_MS = 600;

class TelemetryStore {
  signals = $state<Signal[]>([
    { id: "cpu",    label: "cpu",      unit: "%", history: [], current: 0, min: 0, max: 100 },
    { id: "errors", label: "errors/s", unit: "",  history: [], current: 0, min: 0, max: 50 },
    { id: "queue",  label: "q-depth",  unit: "",  history: [], current: 0, min: 0, max: 200 },
  ]);
  statusItems = $state<StatusItem[]>([]);

  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private revealed = false;

  /**
   * Begin ticking the signal feed. Seeds each signal's history near its
   * baseline so the sparklines have shape from the first frame.
   */
  start(): void {
    if (this.tickHandle) return;
    for (const s of this.signals) {
      const baseline = (s.max + s.min) * 0.4;
      const spread = (s.max - s.min) * 0.15;
      const seeded: number[] = [];
      for (let i = 0; i < HISTORY_LEN; i++) {
        seeded.push(baseline + (Math.random() - 0.5) * spread);
      }
      s.history = seeded;
      s.current = seeded[seeded.length - 1];
    }
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
  }

  /**
   * Stagger-reveal the three red status items. Idempotent — safe to call
   * multiple times; subsequent calls are no-ops.
   */
  revealStatus(): void {
    if (this.revealed) return;
    this.revealed = true;
    const items: Omit<StatusItem, "state">[] = [
      { id: "halberd-monitor",   label: "halberd-monitor",   hint: "alerting · trading-ops" },
      { id: "secondary-runner",  label: "secondary-runner",  hint: "logistics + clinic accts" },
      { id: "comms-relay",       label: "comms-relay",       hint: "outbound notifications" },
    ];
    items.forEach((item, i) => {
      setTimeout(() => {
        this.statusItems = [...this.statusItems, { ...item, state: "red" }];
      }, i * 800);
    });
  }

  startFixing(id: string): boolean {
    const it = this.statusItems.find((x) => x.id === id);
    if (!it || it.state !== "red") return false;
    it.state = "working";
    return true;
  }

  completeFix(id: string): void {
    const it = this.statusItems.find((x) => x.id === id);
    if (it) it.state = "green";
  }

  stop(): void {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }

  private tick(): void {
    const underStress = this.statusItems.some((x) => x.state === "red" || x.state === "working");
    for (const s of this.signals) {
      const last = s.history[s.history.length - 1] ?? (s.max + s.min) * 0.4;
      const baseline = (s.max + s.min) * 0.4;
      // Mean-reverting drift toward baseline
      const drift = (baseline - last) * 0.08;
      // Gaussian-ish noise
      const noise = (Math.random() - 0.5) * (s.max - s.min) * 0.10;
      // Stress bias while incident is live
      const stress = underStress ? (s.max - s.min) * 0.10 * Math.random() : 0;
      const next = Math.max(s.min, Math.min(s.max, last + drift + noise + stress));
      // Keep a fixed-length sliding window so sparklines render predictably.
      s.history = [...s.history.slice(-(HISTORY_LEN - 1)), next];
      s.current = next;
    }
  }
}

export const telemetry = new TelemetryStore();

/**
 * Best-effort match: does the operator's input name one of the still-red
 * status items? Tries direct id match, then a small keyword map. Returns
 * null if no red item is named — caller should fall through to normal chat.
 */
export function matchStatusItem(text: string, items: StatusItem[]): StatusItem | null {
  const lower = text.toLowerCase();

  for (const item of items) {
    if (item.state !== "red") continue;
    if (lower.includes(item.id.toLowerCase())) return item;
  }

  const keywordMap: Record<string, string> = {
    halberd:       "halberd-monitor",
    monitor:       "halberd-monitor",
    alert:         "halberd-monitor",
    alerts:        "halberd-monitor",
    trading:       "halberd-monitor",
    secondary:     "secondary-runner",
    runner:        "secondary-runner",
    logistics:     "secondary-runner",
    clinic:        "secondary-runner",
    smaller:       "secondary-runner",
    "month-to-month": "secondary-runner",
    comms:         "comms-relay",
    relay:         "comms-relay",
    notifications: "comms-relay",
    notification:  "comms-relay",
    notify:        "comms-relay",
    outbound:      "comms-relay",
    offline:       "comms-relay",
  };
  for (const [kw, itemId] of Object.entries(keywordMap)) {
    if (lower.includes(kw)) {
      const m = items.find((i) => i.id === itemId);
      if (m && m.state === "red") return m;
    }
  }
  return null;
}
