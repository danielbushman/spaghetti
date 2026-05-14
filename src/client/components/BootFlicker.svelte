<!--
  Industrial fluorescent-tube startup overlay.

  Two stacked layers compose the effect:

    .flicker  (z 50)  — black scrim that dims/reveals the scene.
                        Owns the "dark" and "dim glow" states.
    .electric (z 51)  — radial-gradient electric-white overlay, screen
                        blend mode. Brightens the scene at every pop
                        for the actual electric-arc flash. Idle = 0.

  The two animations run on the same 13-second timeline but are
  independent — each pop in the base sequence has a matching flash on
  the electric overlay, sometimes with a longer afterglow.

  Story (13s, expanded from 6.5):

     0.0 — 0.4 s   ballast charging, pitch black
     0.4 — 3.0 s   FOUR failed electrical strikes of escalating
                   strength; #4 fully clears scrim and almost catches
     3.0 — 5.0 s   cathode warm-up: slow ease-in-out-quart ramp
                   from near-dark to dim glow
     5.0 — 6.5 s   dim hold with subtle hum variations
     6.5 — 9.0 s   THREE failed bright-strikes during warm-up;
                   #3 nearly catches with a sustained afterglow
     9.0 — 9.5 s   drama pause at dim
     9.5 s         THE STRIKE — both scrim and electric snap to max,
                   electric holds with afterglow
     9.5 — 11 s    stabilization stutter — three arc dips, each
                   shallower than the last
     11 — 12.5 s   smooth expo-out settle into steady state
     12.5 — 13 s   one final tiny twitch

  Three timing-function families layered across the sequence:

    step-end                              — sharp electrical events
                                            (every crack, dip, strike)
    cubic-bezier(0.76, 0, 0.24, 1)        — ease-in-out-quart, slow
                                            cathode warm-up ramp
    cubic-bezier(0.16, 1, 0.3, 1)         — expo-out, final settle

  Both overlays mount once at App startup, run to completion, and stay
  at opacity 0 after. pointer-events: none on both — no lingering cost.
-->
<script lang="ts">
  // No props. Both animations are CSS-driven and one-shot.
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
    Electric arc overlay. Radial gradient so the flash reads as light
    emanating from the tube (brighter center, falling off toward the
    edges) rather than a flat colour wash. mix-blend-mode: screen makes
    it ADD light to whatever's below — pure black underneath becomes
    the overlay colour; bright scene underneath gets pushed toward white.

    Hue is a faint mint — terminal-aesthetic appropriate ("the room
    lights are spilling onto the green CRT") without going full white
    or full cyan.
  */
  .electric {
    position: fixed;
    inset: 0;
    background: radial-gradient(
      ellipse at center,
      #ffffff 0%,
      #d8fff0 30%,
      #88e6c8 70%,
      #2ea08a 100%
    );
    opacity: 0;
    pointer-events: none;
    z-index: 51;
    mix-blend-mode: screen;
    animation: arc-flash 13000ms forwards;
  }

  /*
    Base scrim: dim/dark/clear over 13 seconds.
    Each keyframe's animation-timing-function sets the curve for its
    *outgoing* segment, up to the next keyframe.
  */
  @keyframes tube-warmup {
    /* ───── Phase 1: ballast charging ───── */
    0%  { opacity: 1.00; animation-timing-function: step-end; }
    3%  { opacity: 1.00; animation-timing-function: step-end; }

    /* ───── Phase 2: four failed strikes, escalating ─────
       Each crack pops bright then snaps back to dark. Number 4 fully
       clears the scrim — "almost!" — and falls back to "near dark"
       (0.85, not full 1.0) because the cathodes are starting to glow. */
    4%  { opacity: 0.20; animation-timing-function: step-end; }   /* crack 1 */
    5%  { opacity: 1.00; animation-timing-function: step-end; }
    9%  { opacity: 0.10; animation-timing-function: step-end; }   /* crack 2 */
    10% { opacity: 1.00; animation-timing-function: step-end; }
    14% { opacity: 0.05; animation-timing-function: step-end; }   /* crack 3 */
    15% { opacity: 1.00; animation-timing-function: step-end; }
    20% { opacity: 0.00; animation-timing-function: step-end; }   /* crack 4 — almost! */
    22% { opacity: 0.85; animation-timing-function: step-end; }

    /* ───── Phase 3: cathode warm-up ─────
       Smooth dark → dim ramp. Ease-in-out-quart lingers at darker end,
       accelerates through middle, settles into dim. Filaments heating. */
    23% { opacity: 0.92; animation-timing-function: cubic-bezier(0.76, 0, 0.24, 1); }
    38% { opacity: 0.50; animation-timing-function: step-end; }

    /* ───── Phase 4: dim hold + hum ─────
       Subtle variations sell "alive on the edge of catching". */
    41% { opacity: 0.48; animation-timing-function: step-end; }
    44% { opacity: 0.53; animation-timing-function: step-end; }
    47% { opacity: 0.49; animation-timing-function: step-end; }
    50% { opacity: 0.50; animation-timing-function: step-end; }

    /* ───── Phase 5: three failed bright-strikes ─────
       Arc tries to catch fully and falls back. Each more confident
       than the last; #3 holds bright the longest before failing. */
    54% { opacity: 0.15; animation-timing-function: step-end; }   /* near-strike 1 */
    55% { opacity: 0.50; animation-timing-function: step-end; }
    60% { opacity: 0.08; animation-timing-function: step-end; }   /* near-strike 2 */
    61% { opacity: 0.50; animation-timing-function: step-end; }
    66% { opacity: 0.02; animation-timing-function: step-end; }   /* near-strike 3 — almost! */
    67.5% { opacity: 0.55; animation-timing-function: step-end; }

    /* ───── Phase 6: drama pause ───── */
    72% { opacity: 0.55; animation-timing-function: step-end; }

    /* ───── Phase 7: THE STRIKE ─────
       Instant slam to fully clear. The electric overlay does most of
       the dramatic work here (held flash + long afterglow). */
    73% { opacity: 0.00; animation-timing-function: step-end; }

    /* ───── Phase 8: stabilization stutter ─────
       Three arc dips, each shallower than the last. */
    76% { opacity: 0.22; animation-timing-function: step-end; }   /* dip 1 */
    77% { opacity: 0.00; animation-timing-function: step-end; }
    80% { opacity: 0.14; animation-timing-function: step-end; }   /* dip 2 */
    81% { opacity: 0.00; animation-timing-function: step-end; }
    84% { opacity: 0.07; animation-timing-function: step-end; }   /* dip 3 */
    85% { opacity: 0.00; animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }

    /* ───── Phase 9: smooth settle + twitch ───── */
    96% { opacity: 0.05; animation-timing-function: step-end; }
    97% { opacity: 0.00; animation-timing-function: step-end; }

    100% { opacity: 0.00; }
  }

  /*
    Electric overlay flashes. Each scrim event above gets a matching
    flash here, sized to the event's intensity. Off (0) between events.
    Each flash uses step-end timing for the snap on; the strike's
    afterglow uses ease-out for a soft tail.
  */
  @keyframes arc-flash {
    0%, 3.7%  { opacity: 0.00; animation-timing-function: step-end; }

    /* Crack 1 — small flash */
    4%        { opacity: 0.35; animation-timing-function: step-end; }
    4.6%      { opacity: 0.00; animation-timing-function: step-end; }

    /* Crack 2 — medium */
    9%        { opacity: 0.50; animation-timing-function: step-end; }
    9.7%      { opacity: 0.00; animation-timing-function: step-end; }

    /* Crack 3 — bigger */
    14%       { opacity: 0.65; animation-timing-function: step-end; }
    14.8%     { opacity: 0.00; animation-timing-function: step-end; }

    /* Crack 4 — almost! biggest pre-warmup flash, with tiny afterglow */
    20%       { opacity: 0.80; animation-timing-function: step-end; }
    21%       { opacity: 0.20; animation-timing-function: step-end; }
    21.7%     { opacity: 0.00; animation-timing-function: step-end; }

    /* Warm-up phase: no electric flashes; cathodes glow alone */
    53.5%     { opacity: 0.00; animation-timing-function: step-end; }

    /* Near-strike 1 */
    54%       { opacity: 0.55; animation-timing-function: step-end; }
    54.7%     { opacity: 0.00; animation-timing-function: step-end; }

    /* Near-strike 2 — brighter */
    60%       { opacity: 0.70; animation-timing-function: step-end; }
    60.8%     { opacity: 0.00; animation-timing-function: step-end; }

    /* Near-strike 3 — almost! with afterglow */
    66%       { opacity: 0.85; animation-timing-function: step-end; }
    66.7%     { opacity: 0.40; animation-timing-function: step-end; }
    67.3%     { opacity: 0.10; animation-timing-function: step-end; }
    67.8%     { opacity: 0.00; animation-timing-function: step-end; }

    /* ───── THE STRIKE — the main event ─────
       Hit full brightness, hold, then ease out into a long afterglow.
       The afterglow is what gives the strike weight; without it the
       flash is just a frame. */
    73%       { opacity: 1.00; animation-timing-function: step-end; }
    74.2%     { opacity: 1.00; animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
    78%       { opacity: 0.15; animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
    82%       { opacity: 0.00; animation-timing-function: step-end; }

    100%      { opacity: 0.00; }
  }

  @media (prefers-reduced-motion: reduce) {
    .flicker, .electric {
      animation: none;
      opacity: 0;
    }
  }
</style>
