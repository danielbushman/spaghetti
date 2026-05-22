<!--
  Side column: signals + status. Visible from triage_intro onward.

  Slides in from the right when scene.sideColumnVisible flips true. The
  column is always in the layout (reserves 22rem of width) so the grid
  doesn't reflow when content appears — only the column's content fades
  and slides.
-->
<script lang="ts">
  import { telemetry } from "../stores/telemetry.svelte";
  import { scene } from "../stores/scene.svelte";
  import SignalRow from "./SignalRow.svelte";
  import StatusItemRow from "./StatusItem.svelte";

  let { onpick }: { onpick: (id: string) => void } = $props();
</script>

<aside class="side" class:visible={scene.sideColumnVisible} aria-label="diagnostics">
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
    Slide-in uses position: relative + left (animated) instead of
    transform. transform — even translateX(0) — creates a stacking
    context, which trapped child z-indexes inside .side and stopped
    individual status items from being able to lift above the
    .status-flash overlay (z 200). With position-based slide-in and
    no explicit z-index on .side, the column has *no* stacking
    context once visible, so a child's z-index propagates up to
    root and a single flashing item can pop through the dim.

    Opacity < 1 *does* create a stacking context, but that's only
    during the initial slide-in animation; by the time the staggered
    status reveal happens the column is at opacity 1 and the
    stacking context dissolves.
  */
  .side {
    border-left: 1px solid #114422;
    padding: 0.6rem 0.8rem;
    overflow-y: auto;
    background: #000;
    position: relative;
    left: 20px;
    opacity: 0;
    transition:
      opacity 600ms ease,
      left 600ms cubic-bezier(0.16, 1, 0.3, 1);
    min-height: 0;
  }
  .side.visible {
    opacity: 1;
    left: 0;
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
