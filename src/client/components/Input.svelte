<!--
  Input bar.

  Two states matter:
    booted — false until the agent has typed its opener. Hard-disabled.
    busy   — true while the agent is mid-turn. Stays *typeable*; submits
             during this state get queued by the parent (see App.svelte's
             pendingTexts). This mirrors Claude Code: you can keep typing,
             your text doesn't get rejected, but the agent finishes its
             current turn before answering.

  Focus is grabbed back to the input on every transition into the typeable
  state, including after each agent turn finishes — operator never has to
  click between messages.
-->
<script lang="ts">
  let {
    booted = false,
    busy = false,
    onSend,
  }: {
    booted: boolean;
    busy: boolean;
    onSend: (text: string) => void;
  } = $props();

  let value = $state("");
  let inputEl: HTMLInputElement | undefined = $state();

  // Keep focus in the input whenever it's typeable (i.e. booted). Busy no
  // longer disables the field, so we only need to refocus after the boot
  // transition and after rare external focus loss (e.g. dropdown click).
  $effect(() => {
    if (booted && inputEl && document.activeElement !== inputEl) {
      inputEl.focus({ preventScroll: true });
    }
  });

  function submit(e: Event): void {
    e.preventDefault();
    if (!booted) return;
    const text = value.trim();
    if (!text) return;
    value = "";
    onSend(text);
  }

  const placeholder = $derived(
    !booted ? "…"
    : busy   ? "agent is thinking — your message will queue"
    : "type a message"
  );
</script>

<form onsubmit={submit} class:waiting={busy}>
  <span class="caret">›</span>
  <input
    bind:this={inputEl}
    bind:value
    disabled={!booted}
    {placeholder}
    autocomplete="off"
    autocapitalize="off"
    spellcheck="false"
  />
</form>

<style>
  form {
    display: grid;
    grid-template-columns: 1.5em 1fr;
    align-items: center;
    border: 1px solid #114422;
    padding: 0.4rem 0.6rem;
    background: #000;
    transition:
      border-color 200ms ease,
      box-shadow 200ms ease;
  }
  form:focus-within {
    border-color: #33ff66;
    box-shadow: 0 0 8px rgba(51, 255, 102, 0.2);
  }
  /* Busy state: amber tint so the operator sees the field is alive but the
     agent is still working. Caret also recolours so the cue is visible
     without changing the layout. */
  form.waiting {
    border-color: #553311;
  }
  form.waiting:focus-within {
    border-color: #ffaa33;
    box-shadow: 0 0 8px rgba(255, 170, 51, 0.25);
  }
  form.waiting .caret { color: #ffaa33; }
  .caret { color: #33ff66; font-weight: bold; transition: color 250ms ease; }
  input {
    background: transparent;
    color: #33ff66;
    border: 0;
    outline: 0;
    font-family: inherit;
    font-size: inherit;
    font-weight: bold;
    width: 100%;
  }
  input::placeholder { color: #335544; font-weight: normal; }
  input:disabled { color: #557755; }
</style>
