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

  function submit(e: Event): void {
    e.preventDefault();
    if (!booted || busy) return;
    const text = value.trim();
    if (!text) return;
    value = "";
    onSend(text);
  }
</script>

<form onsubmit={submit} class:disabled={!booted || busy}>
  <span class="caret">›</span>
  <input
    bind:value
    disabled={!booted || busy}
    placeholder={!booted ? "…" : busy ? "thinking…" : "type a message"}
    autocomplete="off"
    autocapitalize="off"
    spellcheck="false"
    autofocus
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
    transition: border-color 200ms ease, box-shadow 200ms ease;
  }
  form:focus-within {
    border-color: #33ff66;
    box-shadow: 0 0 8px rgba(51, 255, 102, 0.2);
  }
  form.disabled { opacity: 0.55; }
  .caret { color: #33ff66; font-weight: bold; }
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
