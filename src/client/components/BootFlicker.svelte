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
  import { speed } from "../stores/speed.svelte";
  import { playCrack, playStrike, playTubeHum } from "../audio/sounds";

  /**
   * Flare bursts synced to the CSS flash keyframes.
   *
   * The base scrim + electric overlay animations live in @keyframes below.
   * JS schedules a burst of bloom flares (motion/flares.ts) at the same
   * instant each electric flash fires — the flashes visibly "expel" soft
   * glowing halos from the top-left corner where the loading indicators
   * live, rather than gravity-driven sparks that would fall to the floor.
   *
   * Speed scaling: the global speed multiplier is captured at mount and
   * applied to both the CSS animation duration (via an inline style)
   * and the JS burst timeouts. If the slider is set to 5× speed, the
   * whole flicker runs in ~2.6s instead of 13s, including the bursts.
   *
   * Burst timings are derived from the base 13000ms timeline:
   *   FLASH 1 at 17%  →   5 flares,  intensity 1.0
   *   FLASH 2 at 50%  →   9 flares,  intensity 1.3
   *   FLASH 3 at 73%  →  18 flares,  intensity 1.8   ← STRIKE
   *
   * Origin point is the centre of the `.light` element (the blinking
   * status dot in the header), looked up at burst time so the bursts
   * track the indicator even if the header layout shifts. Falls back to
   * a fixed top-left position if the element isn't in the DOM.
   *
   * Intensity scales size and drift but NOT lifetime, so the strike feels
   * bigger without dragging out.
   */
  const BASE_DURATION_MS = 13_000;
  /** Strike happens at 73% of the flicker timeline. */
  const STRIKE_PCT = 0.73;
  /**
   * Afterimage has its own duration, longer than the flicker remainder,
   * so the colour-shift fade plays out unhurried after the strike.
   * Scaled by the same speed multiplier as everything else.
   *
   * The first ~78% (≈7s at 1× speed) is the visible drama — punch,
   * mint→rose→fuchsia colour drift, fade to barely-visible. The
   * remaining ~22% (≈2s) is the "ghost tail" — the title hangs at
   * very low opacity for two extra seconds before vanishing entirely.
   */
  const AFTERIMAGE_FADE_BASE_MS = 9_000;

  // Capture at mount — CSS animation runs to its own schedule, so once
  // we hand it a duration the value is fixed for this run.
  const totalMs = BASE_DURATION_MS * speed.multiplier;
  const afterimageDurationMs = AFTERIMAGE_FADE_BASE_MS * speed.multiplier;
  const afterimageDelayMs = totalMs * STRIKE_PCT;

  const BURSTS: Array<{ pct: number; count: number; intensity: number }> = [
    { pct: 0.17, count: 5,  intensity: 1.0 },
    { pct: 0.50, count: 9,  intensity: 1.3 },
    { pct: 0.73, count: 18, intensity: 1.8 },
  ];

  /**
   * Audio cues synced to the boot timeline. The percentages are picked
   * from the CSS keyframes:
   *   17%  small crackle on the first failed strike
   *   23%  start a slow tube hum during cathode warm-up (runs for the
   *        rest of the dim hold, ends by 70%)
   *   50%  a louder crack mid-dim — "almost catches"
   *   73%  THE STRIKE — sub-bass thump + bright crack
   *
   * All are no-ops if audio is muted or the AudioContext hasn't
   * resumed yet.
   */
  type AudioCue = { pct: number; play: () => void };
  const AUDIO_CUES: AudioCue[] = [
    { pct: 0.17, play: () => playCrack(0.5) },
    { pct: 0.23, play: () => {
        // Hum spans cathode-warm-up + dim-hold (~23%-70% of timeline,
        // converted to absolute ms at boot time).
        const humDuration = (totalMs * (0.70 - 0.23)) / 1000;
        playTubeHum(humDuration, 0.7);
      } },
    { pct: 0.50, play: () => playCrack(0.85) },
    { pct: 0.73, play: () => playStrike(1.0) },
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
    for (const { pct, count, intensity } of BURSTS) {
      handles.push(setTimeout(() => {
        const { x, y } = originFromLightOrFallback();
        flareBurst(x, y, count, { intensity });
      }, totalMs * pct));
    }
    for (const { pct, play } of AUDIO_CUES) {
      handles.push(setTimeout(play, totalMs * pct));
    }
    return () => {
      for (const h of handles) clearTimeout(h);
    };
  });
</script>

<div class="flicker" style="animation-duration: {totalMs}ms"></div>
<div class="electric" style="animation-duration: {totalMs}ms"></div>
<!--
  Afterimage. The word "spaghetti" punches in at the moment of THE
  STRIKE (73%), held bright through the electric afterglow, then fades
  by 100%. Position is in the upper third (roughly golden-ratio) and
  the letters are scaleY'd ~3.5× from their tops so they elongate
  downward like long pasta strands.

  Two-element structure: the outer div owns positioning + opacity
  animation; the inner span owns the text + static transform. Keeps
  the layout math separate from the visual stretch.
-->
<div
  class="afterimage"
  style="animation-duration: {afterimageDurationMs}ms; animation-delay: {afterimageDelayMs}ms;"
  aria-hidden="true"
>
  <span class="stretched">spaghetti</span>
</div>

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

  /*
    Spaghetti afterimage. Full-screen centred title that punches in at
    the strike moment and diffuses + colour-shifts toward terminal green
    as it fades. Layered above the scrim/electric (z 55) but below the
    spark/flare particles (z 100) so the flares can spray over the text.

    The colour transition white → mint → terminal green is part of the
    visual story: the flash is electric/cool, and as the eyes adjust
    the after-image settles into the room's actual light (terminal green).

    Letter-spacing grows over the fade — the after-image diffuses as it
    loses intensity, the way burn-in does.
  */
  /*
    Two-layer structure:

    .afterimage  flex container that pins the text in the upper third
                 of the viewport. Owns opacity + colour + text-shadow
                 (all animated). animation-delay = strike moment, so
                 the element is invisible (base opacity 0) until then
                 and punches in at the delay edge.

    .stretched   the actual text, scaleY-stretched 3.5× from its TOP
                 edge so it hangs downward like pasta. Colour and
                 text-shadow inherit from .afterimage so they pick up
                 the animated values — only transform is static here.

    The animation uses linear timing so colour and opacity interpolate
    at the same rate. Mismatched easings between multi-property
    animations was the original "hiccupy" problem.
  */
  .afterimage {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 16vh;
    pointer-events: none;
    z-index: 55;
    opacity: 0;
    color: #ffffff;
    text-shadow: none;
    user-select: none;
    animation: spaghetti-afterimage 7000ms linear forwards;
    will-change: opacity, color, text-shadow;
  }
  .afterimage .stretched {
    display: inline-block;
    font-family: inherit;
    font-size: clamp(3.5rem, 12vw, 14rem);
    font-weight: bold;
    letter-spacing: 0.18em;
    /* colour + text-shadow inherited from .afterimage */
    transform: scaleY(3.5);
    transform-origin: top center;
    white-space: nowrap;
  }

  /*
    Colour-shift fade. Five keyframes, linear interpolation between
    them. The colour walks from electric-flash white through mint and
    lavender to fuchsia violet, while opacity glides 0.95 → 0 over
    the full 7 seconds. Slow enough that the colour drift reads as
    a deliberate temperature shift rather than a cross-fade jitter.

    The animation only starts at the strike moment (animation-delay
    on the element). Before that the base opacity 0 keeps the element
    invisible.
  */
  @keyframes spaghetti-afterimage {
    /*
      Keyframe percentages are mapped to the 9s timeline so the visible
      drama (0% → 66%) takes the same ~6s it always did. The remaining
      ~33% of the timeline (~3s, of which ~2s is the new ghost-tail
      contribution) holds the title at barely-visible opacity and
      finally fades it out.

      Timing on the 9s timeline:
        0     %  →  0    ms      strike punch
       12     %  →  1080 ms      held bright (was 15% of 7s = 1050ms)
       39     %  →  3510 ms      mid-fade lavender (was 50% of 7s = 3500ms)
       66     %  →  5940 ms      almost-gone fuchsia (was 85% of 7s = 5950ms)
       78     %  →  7020 ms      barely-visible threshold (was 100% of 7s)
       98     %  →  8820 ms      still barely visible — ~1800ms hold
       100    %  →  9000 ms      cleared
    */
    /* Punch in: electric white-mint flash. */
    0% {
      opacity: 0.95;
      color: #ffffff;
      text-shadow:
        0 0 80px rgba(216, 255, 240, 0.9),
        0 0 160px rgba(136, 230, 200, 0.55);
    }
    /* Held bright; very faint mint tint. */
    12% {
      opacity: 0.78;
      color: #e8fff0;
      text-shadow:
        0 0 56px rgba(200, 240, 220, 0.65),
        0 0 100px rgba(180, 220, 200, 0.25);
    }
    /* Drifting through dusty rose / lavender — temperature
       transitions from cool electric to warm magenta. */
    39% {
      opacity: 0.42;
      color: #d090d0;
      text-shadow: 0 0 40px rgba(208, 144, 208, 0.55);
    }
    /* Almost there — saturated fuchsia, low opacity. */
    66% {
      opacity: 0.15;
      color: #c850e0;
      text-shadow: 0 0 22px rgba(200, 80, 224, 0.4);
    }
    /* Entered the ghost-tail — barely visible from here on. */
    78% {
      opacity: 0.05;
      color: #c026d3;
      text-shadow: 0 0 10px rgba(192, 38, 211, 0.3);
    }
    /* Still lingering ~2 seconds after the visible drama ended,
       drifting toward zero so the fade-to-vanish is smooth. */
    98% {
      opacity: 0.02;
      color: #c026d3;
      text-shadow: none;
    }
    /* Cleared. */
    100% {
      opacity: 0;
      color: #c026d3;
      text-shadow: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .flicker, .electric, .afterimage {
      animation: none;
      opacity: 0;
    }
  }
</style>
