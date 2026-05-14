<!--
  One message in the chat log.

  Entry motion:
    user   → slides in from the right with overshoot
    agent  → slides in from the left with overshoot
    system → fades in, no horizontal motion

  While `message.typing` is true, a cursor blinks after the visible text.
-->
<script lang="ts">
  import type { Message } from "../stores/chat.svelte";
  import { onMount } from "svelte";
  import { overshoot, smooth } from "../motion/easings";

  let { message }: { message: Message } = $props();

  let el: HTMLDivElement | undefined = $state();
  let cursorOn = $state(true);

  // Entry motion (one-shot). The component never replays this on prop change.
  onMount(() => {
    if (!el) return;
    const startX =
      message.role === "user"  ?  18 :
      message.role === "agent" ? -18 :
                                   0;
    const duration = message.role === "system" ? 220 : 380;
    const ease = message.role === "system" ? smooth : overshoot;
    const t0 = performance.now();
    let raf = 0;

    function frame(t: number) {
      const p = Math.min(1, (t - t0) / duration);
      const e = ease(p);
      el!.style.transform = `translateX(${startX * (1 - e)}px)`;
      el!.style.opacity = String(Math.min(1, p * 1.6));
      if (p < 1) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(raf);
  });

  // Cursor blink, scoped to the typing window. The $effect cleanup runs when
  // `message.typing` flips false (or the component unmounts), so the interval
  // doesn't outlive the cursor it animates.
  $effect(() => {
    if (!message.typing) return;
    const blinker = setInterval(() => { cursorOn = !cursorOn; }, 500);
    return () => clearInterval(blinker);
  });

  let prefix = $derived(
    message.role === "user"  ? "you> "  :
    message.role === "agent" ? "agent> " :
                                ""
  );
</script>

<!--
  Each character lives in its own <span> so a CSS animation can fire when it
  mounts — giving the leading edge of typed text a soft "materialize" rather
  than a hard pop. The compound key (`${i}-${ch}`) ensures spans only mount
  on first arrival of a position; mutating a character at an existing index
  (e.g. the system→error transformation) updates content without re-firing
  the animation, but if the whole message swaps roles we'd want a remount —
  in practice the error path also rewrites the index sequence, so keys
  change and animations replay cleanly.
-->
<div class="msg msg-{message.role}" bind:this={el} style="opacity: 0;"
  ><span class="prefix">{prefix}</span><span class="text"
  >{#each [...message.visible] as ch, i (`${i}-${ch}`)}<span class="char">{ch}</span>{/each}</span
  >{#if message.typing}<span class="cursor" class:on={cursorOn}>▌</span>{/if}</div>

<style>
  .msg {
    margin: 0.15rem 0;
    will-change: transform, opacity;
  }
  .msg-system {
    color: #557755;
    font-style: italic;
  }
  .msg-user .prefix { color: #66ffaa; font-weight: bold; }
  .msg-user .text   { color: #cceedd; }
  .msg-agent .prefix { color: #33ff66; font-weight: bold; }
  .msg-agent .text   { color: #33ff66; }
  /*
    Per-character materialize. Opacity-only so the animation works on inline
    elements (transforms don't apply to non-block boxes) and so word wrapping
    is unaffected — the chars stay in normal inline flow. The expo-out curve
    snaps the char to visible quickly, then settles.
  */
  .char {
    animation: char-in 160ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes char-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .char { animation: none; }
  }
  .cursor {
    color: #33ff66;
    opacity: 0;
    transition: opacity 120ms;
    margin-left: 0.05em;
  }
  .cursor.on { opacity: 1; }
</style>
