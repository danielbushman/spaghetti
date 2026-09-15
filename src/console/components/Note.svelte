<!--
  Note — one of the co-founder's notes, verbatim (plan §7 T6).

  Italic UI face, the date in muted mono, a thin accent rule on the left.
  No attribution line and no added words: the note is the content.
-->
<script lang="ts">
  import type { CoFounderNote } from '../../sim/types';

  let { note }: { note: CoFounderNote } = $props();
</script>

<blockquote class="note">
  <span class="date mono dim">{note.date}</span>
  <p class="text">{note.text}</p>
</blockquote>

<style>
  .note {
    margin: 0;
    padding: 0.2em 0 0.2em 0.8em;
    border-left: 2px solid var(--accent);
    display: grid;
    gap: 0.15em;
  }
  .date {
    font-size: 0.8em;
    font-style: normal;
  }
  .text {
    font-family: var(--font-ui);
    font-style: italic;
    color: var(--fg);
  }
</style>
