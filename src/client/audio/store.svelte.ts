/**
 * Audio settings: muted state + master volume. Both persisted via
 * localStorage. Changes propagate to the AudioEngine immediately
 * (smooth-ramped to avoid clicks).
 */
import { audioEngine } from "./engine";

const KEY_MUTED = "spaghetti.audio.muted";
const KEY_VOLUME = "spaghetti.audio.volume";

function readMuted(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(KEY_MUTED) === "1";
  } catch {
    return false;
  }
}

function readVolume(): number {
  if (typeof localStorage === "undefined") return 0.5;
  try {
    const raw = localStorage.getItem(KEY_VOLUME);
    if (!raw) return 0.5;
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  } catch {
    /* ignore */
  }
  return 0.5;
}

class AudioStore {
  muted = $state(readMuted());
  volume = $state(readVolume());

  setMuted(v: boolean): void {
    this.muted = v;
    audioEngine.setMuted(v);
    try {
      localStorage.setItem(KEY_MUTED, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  toggleMuted(): void {
    this.setMuted(!this.muted);
  }

  setVolume(v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    this.volume = clamped;
    audioEngine.setMasterGain(clamped);
    try {
      localStorage.setItem(KEY_VOLUME, String(clamped));
    } catch {
      /* ignore */
    }
  }
}

export const audio = new AudioStore();

/**
 * Push the persisted volume + mute state into the engine. Called
 * once the AudioContext has been resumed (i.e. after the first user
 * gesture). Before that the engine ignores gain changes.
 */
export function syncAudioStoreToEngine(): void {
  audioEngine.setMasterGain(audio.volume);
  audioEngine.setMuted(audio.muted);
}
