<!--
  Side column: signals + status. Visible from triage_intro onward.

  Slides in from the right when scene.sideColumnVisible flips true. The
  column is always in the layout (reserves 22rem of width) so the grid
  doesn't reflow when content appears — only the column's content fades
  and slides.

  Reveal motion: spring-based (motion/spring.ts → `springReveal`).
  Lets the panel arrive with a tiny overshoot rather than a fixed-
  duration ease — physics-paced. The same primitive is what the future
  management UI panel will use; pass `from: "left"` or `from: "bottom"`
  there as the layout requires.
-->
<script lang="ts">
  import { telemetry } from "../stores/telemetry.svelte";
  import { scene } from "../stores/scene.svelte";
  import { springReveal, SPRINGS } from "../motion/spring";
  import SignalRow from "./SignalRow.svelte";
  import StatusItemRow from "./StatusItem.svelte";

  let { onpick }: { onpick: (id: string) => void } = $props();
</script>

<aside
  class="side"
  class:visible={scene.sideColumnVisible}
  aria-label="diagnostics"
  use:springReveal={{
    visible:  scene.sideColumnVisible,
    from:     "right",
    distance: 20,
    config:   SPRINGS.noWobble,
  }}
>
  <section>
    <h3>signals</h3>
    <div class="signals">
      {#each telemetry.signals as sig (sig.id)}
        <SignalRow signal={sig} />
      {/each}
    </div>
  </section>

  <section>
    <h3>status</h3>
    {#if telemetry.statusItems.length === 0}
      <div class="empty">— pulling diagnostics —</div>
    {:else}
      <div class="status">
        {#each telemetry.statusItems as item (item.id)}
          <StatusItemRow {item} {onpick} />
        {/each}
      </div>
    {/if}
  </section>
</aside>

<style>
  /*
    Spring-based slide-in (use:springReveal in the markup) drives
    `transform: translateX(...)` and `opacity` from JS on rAF. The
    historical concern about transform creating a stacking context
    (which would trap child z-indexes below the status-flash overlay)
    is finessed by zero-ing the transform once the panel settles — at
    rest the action writes `translateX(0px)`, which matches identity
    and removes the stacking context after the spring completes.

    Opacity is only < 1 during the reveal animation itself; once the
    spring settles the action writes `opacity: 1` and the stacking
    context dissolves so child .flashing items can still lift above
    the .status-flash overlay (z 200).
  */
  .side {
    border-left: 1px solid #114422;
    padding: 0.6rem 0.8rem;
    overflow-y: auto;
    background: #000;
    position: relative;
    min-height: 0;
    /* Initial state: hidden until springReveal paints. The action
       overwrites both properties on mount; this just avoids a
       single frame of "fully visible at offset 0" before the JS
       runs in case the action's first paint races layout. */
    opacity: 0;
    transform: translateX(20px);
  }
  h3 {
    color: #557755;
    font-size: 0.78em;
    font-weight: bold;
    text-transform: lowercase;
    letter-spacing: 0.15em;
    margin: 0 0 0.4rem 0;
    padding-bottom: 0.2rem;
    border-bottom: 1px solid #114422;
  }
  section + section { margin-top: 1rem; }
  .empty {
    color: #335544;
    font-style: italic;
    font-size: 0.88em;
    padding: 0.3rem 0;
  }
  .side::-webkit-scrollbar { width: 6px; }
  .side::-webkit-scrollbar-thumb { background: #114422; }
  .side::-webkit-scrollbar-track { background: transparent; }
</style>
