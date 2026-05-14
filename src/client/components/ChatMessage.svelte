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

    // Cursor blink while typing. setInterval not RAF — 500ms is too slow to bother.
    const blinker = setInterval(() => { cursorOn = !cursorOn; }, 500);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(blinker);
    };
  });

  let prefix = $derived(
    message.role === "user"  ? "you> "  :
    message.role === "agent" ? "agent> " :
                                ""
  );
</script>

<div class="msg msg-{message.role}" bind:this={el} style="opacity: 0;"
  ><span class="prefix">{prefix}</span><span class="text">{message.visible}</span
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
  .cursor {
    color: #33ff66;
    opacity: 0;
    transition: opacity 120ms;
    margin-left: 0.05em;
  }
  .cursor.on { opacity: 1; }
</style>
