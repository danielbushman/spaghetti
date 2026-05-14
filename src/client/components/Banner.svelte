<!--
  ASCII boot banner. Color shifts with boot phase. Hidden once we're online
  long enough that it would just be visual chrome.
-->
<script lang="ts">
  import { boot } from "../stores/boot.svelte";
</script>

<pre class="banner phase-{boot.phase}">  ___ ___  ___  ___ _  _ ___ _____ _____ ___
 / __| _ \/ _ \/ __| || | __|_   _|_   _|_ _|
 \__ \  _/ (_) \__ \ __ | _|  | |   | |  | |
 |___/_|  \___/|___/_||_|___| |_|   |_| |___|
</pre>

<style>
  .banner {
    margin: 0;
    padding: 0.25rem 0.5rem;
    text-align: center;
    font-family: inherit;
    color: #114422;
    font-weight: bold;
    transition: color 800ms ease, text-shadow 800ms ease, opacity 800ms ease;
    line-height: 1.1;
    user-select: none;
  }
  .phase-idle { opacity: 0.5; }
  .phase-warm { color: #886622; text-shadow: 0 0 4px rgba(255,170,51,0.4); }
  .phase-online { color: #33ff66; text-shadow: 0 0 8px rgba(51,255,102,0.5); }
</style>
