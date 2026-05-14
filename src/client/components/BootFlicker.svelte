<!--
  Industrial fluorescent-tube startup overlay.

  Real fluorescent tubes don't switch on cleanly. Roughly:

    1. Ballast charges (pitch dark hold).
    2. The igniter strikes the gas — first attempts are weak electrical
       cracks that fail to ionize. You see brief flickers.
    3. Cathode warm-up: filaments heat up over a second or two and emit
       a dim orange glow. The room is dim, not lit.
    4. While still in warm-up, the gas tries to fully ionize and fails
       once or twice — bright flashes that drop back to dim.
    5. The arc finally catches: the room SLAMS to full brightness.
    6. Stabilization: a couple of small dips back as the arc settles.
    7. Steady state.

  This component composes that whole story on a fixed black scrim above
  the scene. Total duration: 6.5 seconds. The boot lines in the chat panel
  type through the dim warm-up phase, then the strike happens around the
  time the system goes "online".

  Three distinct timing functions are layered through the sequence so each
  physical phenomenon gets the right curve:

    step-end                              — sharp electrical events
                                            (everything not noted below)
    cubic-bezier(0.76, 0, 0.24, 1)        — ease-in-out-quart, the slow
                                            cathode warm-up ramp
    cubic-bezier(0.16, 1, 0.3, 1)         — expo-out, the final settle
                                            after the stabilization stutter

  No conditional mount. The animation runs to completion regardless of
  scene phase; `forwards` parks the scrim at opacity 0 once done, and
  `pointer-events: none` means the lingering element is free.
-->
<script lang="ts">
  // No props. CSS animation owns the timeline.
</script>

<div class="flicker"></div>

<style>
  .flicker {
    position: fixed;
    inset: 0;
    background: #000;
    opacity: 1.0;
    pointer-events: none;
    z-index: 50;
    animation: tube-warmup 6500ms forwards;
  }

  /*
    Opacity in this animation: 1.0 = pitch dark scrim covers everything,
    0.0 = scrim is fully clear and scene is visible.

    Each keyframe's `animation-timing-function` sets the curve used for
    the segment that *follows* it, up to the next keyframe.
  */
  @keyframes tube-warmup {
    /* ========================================================
       Phase 1: Pre-strike (0 - 0.4s)
       Ballast charging. Pitch black, nothing happening yet.
       ======================================================== */
    0%  { opacity: 1.00; animation-timing-function: step-end; }
    4%  { opacity: 1.00; animation-timing-function: step-end; }

    /* ========================================================
       Phase 2: Failed strikes (0.4 - 1.5s)
       Three attempts of increasing strength. Each is a sharp electrical
       crack that fails to fully ionize the gas; the third nearly catches.
       ======================================================== */
    6%  { opacity: 0.10; animation-timing-function: step-end; }   /* crack 1 — brief */
    7%  { opacity: 1.00; animation-timing-function: step-end; }
    14% { opacity: 0.40; animation-timing-function: step-end; }   /* crack 2 — mid */
    15% { opacity: 1.00; animation-timing-function: step-end; }
    22% { opacity: 0.05; animation-timing-function: step-end; }   /* crack 3 — almost! */

    /* ========================================================
       Phase 3: Cathode warm-up (1.5 - 2.7s)
       SMOOTH dark → dim ramp. The cathodes glow as their filaments heat;
       the gas isn't ionized yet so we get only a faint ambient light.
       This is the slow, suspenseful build. ease-in-out-quart lingers at
       dark before accelerating through the middle and settling at dim.
       ======================================================== */
    23% { opacity: 0.92; animation-timing-function: cubic-bezier(0.76, 0, 0.24, 1); }
    42% { opacity: 0.50; animation-timing-function: step-end; }

    /* ========================================================
       Phase 4: Dim hold + hum (2.7 - 3.6s)
       Suspenseful pause. The screen sits at dim glow while the gas hums
       on the edge of ionizing. Subtle variations sell the "alive but
       not yet" feel.
       ======================================================== */
    50% { opacity: 0.50; animation-timing-function: step-end; }
    52% { opacity: 0.46; animation-timing-function: step-end; }
    54% { opacity: 0.53; animation-timing-function: step-end; }
    56% { opacity: 0.50; animation-timing-function: step-end; }

    /* ========================================================
       Phase 5: Failed bright-strikes (3.6 - 4.6s)
       The arc tries to fully catch a couple of times — bright spikes
       that drop back to dim. Each attempt is more confident than the
       last (second one goes brighter than the first).
       ======================================================== */
    61% { opacity: 0.50; animation-timing-function: step-end; }
    62% { opacity: 0.15; animation-timing-function: step-end; }   /* near-strike 1 */
    63% { opacity: 0.50; animation-timing-function: step-end; }
    69% { opacity: 0.50; animation-timing-function: step-end; }
    70% { opacity: 0.06; animation-timing-function: step-end; }   /* near-strike 2 — almost! */
    71% { opacity: 0.50; animation-timing-function: step-end; }

    /* Brief drama pause at dim, then ... */
    73% { opacity: 0.50; animation-timing-function: step-end; }

    /* ========================================================
       Phase 6: THE STRIKE (4.9s)
       Instant slam. The room is fully lit.
       ======================================================== */
    75% { opacity: 0.00; animation-timing-function: step-end; }

    /* ========================================================
       Phase 7: Stabilization stutter (4.9 - 5.5s)
       Arc establishing. Small dips back as the discharge finds
       equilibrium. Each dip is shallower than the last.
       ======================================================== */
    76% { opacity: 0.00; animation-timing-function: step-end; }
    77% { opacity: 0.18; animation-timing-function: step-end; }   /* arc dip 1 */
    78% { opacity: 0.00; animation-timing-function: step-end; }
    81% { opacity: 0.00; animation-timing-function: step-end; }
    82% { opacity: 0.10; animation-timing-function: step-end; }   /* arc dip 2 */
    83% { opacity: 0.00; animation-timing-function: step-end; }

    /* ========================================================
       Phase 8: Smooth settle (5.5 - 6.3s)
       Expo-out: snappy off the stutter, then a long tail into perfect
       steady-state. Mostly invisible because we're already at 0, but
       it gives the very end of the sequence a soft easing rather than
       an abrupt stop.
       ======================================================== */
    86% { opacity: 0.00; animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }

    /* ========================================================
       Phase 9: Final twitch (6.3 - 6.4s)
       The hint of one last flicker. Even after the arc has stabilized,
       a real tube does this once or twice. Confirms it's a tube, not a
       LED.
       ======================================================== */
    96% { opacity: 0.05; animation-timing-function: step-end; }
    97% { opacity: 0.00; animation-timing-function: step-end; }

    100% { opacity: 0.00; }
  }

  @media (prefers-reduced-motion: reduce) {
    .flicker {
      animation: none;
      opacity: 0;
    }
  }
</style>
