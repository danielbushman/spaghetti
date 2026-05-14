<!--
  Industrial fluorescent-tube startup overlay.

  Two stacked layers:

    .flicker  (z 50)  — black scrim that dims/reveals the scene.
                        Owns the "dark", "dim glow", and the brief
                        flicker *punchmarks*: small, sharp drops in
                        opacity that read as electrical disturbance
                        without involving the colour overlay.
    .electric (z 51)  — radial-gradient mint-white overlay, screen
                        blend. Used only for the THREE actual electric
                        flashes spread across the sequence. Idle = 0.

  The two animations run on the same 13-second timeline. Most events
  on the scrim are *not* matched on the electric overlay — those are
  the punchmark flickers. Only three moments fire both: the genuine
  arc attempts.

  Story (13s):

     0.0 — 0.6 s   pitch black hold (ballast charging)
     0.6 — 2.2 s   two small flicker punchmarks (scrim-only)
     2.2 s         ⚡ FLASH 1 — first real arc attempt; fails into warm-up
     3.0 — 5.0 s   cathode warm-up: slow ease-in-out-quart ramp
     5.0 — 6.5 s   dim hold + subtle hum
     6.5 s         ⚡ FLASH 2 — gas briefly catches mid-dim, drops back
     6.5 — 9.4 s   continued dim hold with one small punchmark
     9.5 s         ⚡⚡⚡ FLASH 3 — THE STRIKE, with long ease-out afterglow
     9.5 — 11 s    stabilization stutter (two arc dips, no flashes)
     11 — 12.5 s   smooth expo-out settle
     12.5 — 13 s   final tiny twitch

  Three timing-function families:

    step-end                              — sharp electrical events
                                            (every flicker, dip, strike)
    cubic-bezier(0.76, 0, 0.24, 1)        — ease-in-out-quart, slow
                                            cathode warm-up ramp
    cubic-bezier(0.16, 1, 0.3, 1)         — expo-out, final settle
                                            and the strike's afterglow

  Both overlays mount once at App startup, run to completion, and rest
  at opacity 0. pointer-events: none on both.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { flareBurst } from "../motion/flares";

  /**
   * Flare bursts synced to the CSS flash keyframes.
   *
   * The base scrim + electric overlay animations live in @keyframes below.
   * JS schedules a burst of bloom flares (motion/flares.ts) at the same
   * instant each electric flash fires — the flashes visibly "expel" soft
   * glowing halos from the top-left corner where the loading indicators
   * live, rather than gravity-driven sparks that would fall to the floor.
   *
   * Times are derived from the 13000ms animation duration:
   *   FLASH 1 at 17%  →  2210ms,   5 flares,  intensity 1.0
   *   FLASH 2 at 50%  →  6500ms,   9 flares,  intensity 1.3
   *   FLASH 3 at 73%  →  9490ms,  18 flares,  intensity 1.8   ← STRIKE
   *
   * Origin point is the centre of the `.light` element (the blinking
   * status dot in the header), looked up at burst time so the bursts
   * track the indicator even if the header layout shifts. Falls back to
   * a fixed top-left position if the element isn't in the DOM.
   *
   * Intensity scales size and drift but NOT lifetime, so the strike feels
   * bigger without dragging out.
   */
  const BURSTS: Array<{ delay: number; count: number; intensity: number }> = [
    { delay: 2_210, count: 5,  intensity: 1.0 },
    { delay: 6_500, count: 9,  intensity: 1.3 },
    { delay: 9_490, count: 18, intensity: 1.8 },
  ];

  function originFromLightOrFallback(): { x: number; y: number } {
    if (typeof document === "undefined") return { x: 30, y: 30 };
    const light = document.querySelector(".light");
    if (light) {
      const r = light.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return { x: 30, y: 30 };
  }

  onMount(() => {
    const handles: ReturnType<typeof setTimeout>[] = [];
    for (const { delay, count, intensity } of BURSTS) {
      handles.push(setTimeout(() => {
        const { x, y } = originFromLightOrFallback();
        flareBurst(x, y, count, { intensity });
      }, delay));
    }
    return () => {
      for (const h of handles) clearTimeout(h);
    };
  });
</script>

<div class="flicker"></div>
<div class="electric"></div>

<style>
  .flicker {
    position: fixed;
    inset: 0;
    background: #000;
    opacity: 1.0;
    pointer-events: none;
    z-index: 50;
    animation: tube-warmup 13000ms forwards;
  }

  /*
    Electric arc overlay. Radial gradient so each flash reads as light
    radiating from a source rather than a flat colour wash. The centre
    is a near-white mint (not pure white) so even at peak opacity the
    flash brightens the scene without blowing it out.

    mix-blend-mode: screen adds light. Dark scrim underneath becomes the
    overlay colour; visible scene gets pushed toward the gradient.
  */
  .electric {
    position: fixed;
    inset: 0;
    background: radial-gradient(
      ellipse at center,
      #e0fff5 0%,
      #b0eed8 40%,
      #5cb89d 80%,
      #1f5446 100%
    );
    opacity: 0;
    pointer-events: none;
    z-index: 51;
    mix-blend-mode: screen;
    animation: arc-flash 13000ms forwards;
  }

  /*
    Base scrim: dim/dark/clear over 13 seconds.
    Each keyframe's animation-timing-function applies to its *outgoing*
    segment, up to the next keyframe.
  */
  @keyframes tube-warmup {
    /* ───── Phase 1: ballast charging — pitch black ───── */
    0%   { opacity: 1.00; animation-timing-function: step-end; }
    4%   { opacity: 1.00; animation-timing-function: step-end; }

    /* ───── Phase 2: two flicker punchmarks ─────
       Scrim-only. Brief small drops then snap back to dark. */
    5%   { opacity: 0.60; animation-timing-function: step-end; }    /* punch 1 */
    6%   { opacity: 1.00; animation-timing-function: step-end; }
    12%  { opacity: 0.45; animation-timing-function: step-end; }    /* punch 2 */
    13%  { opacity: 1.00; animation-timing-function: step-end; }
    16%  { opacity: 1.00; animation-timing-function: step-end; }

    /* ───── ⚡ FLASH 1 (17%): first real arc attempt ─────
       Scrim drops to fully clear; electric overlay fires (separate kf).
       Falls back to near-dark (0.85, not 1.0) as the cathodes warm. */
    17%  { opacity: 0.00; animation-timing-function: step-end; }
    19%  { opacity: 0.40; animation-timing-function: step-end; }
    21%  { opacity: 0.85; animation-timing-function: step-end; }

    /* ───── Phase 4: cathode warm-up ─────
       Smooth dark → dim. ease-in-out-quart for a slow filament-warming
       feel — lingers at dark, accelerates, settles into dim glow. */
    23%  { opacity: 0.92; animation-timing-function: cubic-bezier(0.76, 0, 0.24, 1); }
    38%  { opacity: 0.50; animation-timing-function: step-end; }

    /* ───── Phase 5: dim hold + hum ───── */
    41%  { opacity: 0.48; animation-timing-function: step-end; }
    44%  { opacity: 0.53; animation-timing-function: step-end; }
    47%  { opacity: 0.49; animation-timing-function: step-end; }

    /* ───── ⚡ FLASH 2 (50%): almost catches during warm-up ─────
       Gas briefly ionizes — bright arc, then falls back to dim. */
    50%  { opacity: 0.00; animation-timing-function: step-end; }
    52%  { opacity: 0.30; animation-timing-function: step-end; }
    54%  { opacity: 0.50; animation-timing-function: step-end; }

    /* ───── Phase 7: dim hold continues, one small punchmark ───── */
    59%  { opacity: 0.50; animation-timing-function: step-end; }
    60%  { opacity: 0.34; animation-timing-function: step-end; }    /* punch 3 */
    61%  { opacity: 0.50; animation-timing-function: step-end; }

    /* ───── Phase 8: drama pause at dim ───── */
    72%  { opacity: 0.52; animation-timing-function: step-end; }

    /* ───── ⚡⚡⚡ FLASH 3 (73%): THE STRIKE ─────
       Instant slam. Electric overlay does most of the visible work
       here with its sustained afterglow (separate kf). */
    73%  { opacity: 0.00; animation-timing-function: step-end; }

    /* ───── Phase 10: stabilization stutter (two dips, no flashes) ───── */
    76%  { opacity: 0.20; animation-timing-function: step-end; }    /* dip 1 */
    77%  { opacity: 0.00; animation-timing-function: step-end; }
    81%  { opacity: 0.10; animation-timing-function: step-end; }    /* dip 2 (smaller) */
    82%  { opacity: 0.00; animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }

    /* ───── Phase 11: smooth settle + final twitch ───── */
    96%  { opacity: 0.05; animation-timing-function: step-end; }
    97%  { opacity: 0.00; animation-timing-function: step-end; }

    100% { opacity: 0.00; }
  }

  /*
    Electric overlay: only fires at the three real arc attempts. Idle
    (opacity 0) for the entire rest of the timeline. Each flash uses
    step-end for the snap on; the strike's afterglow uses expo-out for
    a soft tail.
  */
  @keyframes arc-flash {
    0%, 16.5%  { opacity: 0.00; animation-timing-function: step-end; }

    /* ⚡ FLASH 1 — small but visible first arc */
    17%        { opacity: 0.55; animation-timing-function: step-end; }
    17.7%      { opacity: 0.25; animation-timing-function: step-end; }
    18.4%      { opacity: 0.05; animation-timing-function: step-end; }
    19%        { opacity: 0.00; animation-timing-function: step-end; }

    /* Quiet across warm-up and dim hold */
    49.5%      { opacity: 0.00; animation-timing-function: step-end; }

    /* ⚡ FLASH 2 — bigger, almost-catches */
    50%        { opacity: 0.75; animation-timing-function: step-end; }
    50.8%      { opacity: 0.35; animation-timing-function: step-end; }
    51.6%      { opacity: 0.10; animation-timing-function: step-end; }
    52.5%      { opacity: 0.00; animation-timing-function: step-end; }

    /* Quiet through second dim stretch and drama pause */
    72.5%      { opacity: 0.00; animation-timing-function: step-end; }

    /* ⚡⚡⚡ FLASH 3 — THE STRIKE with long afterglow */
    73%        { opacity: 1.00; animation-timing-function: step-end; }
    74.5%      { opacity: 1.00; animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
    78%        { opacity: 0.18; animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
    82%        { opacity: 0.00; animation-timing-function: step-end; }

    100%       { opacity: 0.00; }
  }

  @media (prefers-reduced-motion: reduce) {
    .flicker, .electric {
      animation: none;
      opacity: 0;
    }
  }
</style>
