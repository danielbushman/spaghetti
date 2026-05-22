/**
 * Web Audio singleton + master-bus wiring.
 *
 * The AudioContext is created lazily on the first `resume()` call —
 * browsers require a user gesture (click/keydown) before any sound
 * can actually play, so we defer until the photosensitivity warning
 * is dismissed. Before that the engine is silent and every play*
 * helper is a no-op.
 *
 * The master gain sits between every synth/file source and
 * `destination`, so a single `setMasterGain(v)` controls overall
 * loudness. Muting is just setMasterGain(0); the volume value is
 * remembered separately so unmute restores it.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  /** Volume the master should ramp to when initialised or unmuted. */
  private pendingVolume = 0.5;
  /** True while muted. setMasterGain(0) sets the gain to 0 immediately. */
  private muted = false;

  /**
   * Ensure the context exists and is running. Safe to call repeatedly.
   * Must be invoked from a user-gesture handler the first time.
   */
  async resume(): Promise<void> {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      // Some older browsers expose webkitAudioContext only.
      const Ctor: typeof AudioContext =
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext ?? AudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.pendingVolume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* swallow — older Safari sometimes throws here */
      }
    }
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Master gain node. Synths should connect their final stage here. */
  get masterNode(): GainNode | null {
    return this.master;
  }

  /** Convenience — true once the context exists and is running. */
  get isLive(): boolean {
    return this.ctx?.state === "running";
  }

  /**
   * Set the master volume (0..1). Ramps over 50ms to avoid pops.
   * No-op when muted — call setMuted(false) first.
   */
  setMasterGain(v: number): void {
    this.pendingVolume = Math.max(0, Math.min(1, v));
    if (!this.master || !this.ctx) return;
    if (this.muted) return;
    this.master.gain.linearRampToValueAtTime(
      this.pendingVolume,
      this.ctx.currentTime + 0.05,
    );
  }

  /** Toggle muting. Ramped to avoid clicks; volume value is preserved. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.master || !this.ctx) return;
    const target = muted ? 0 : this.pendingVolume;
    this.master.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 0.05);
  }
}

export const audioEngine = new AudioEngine();
