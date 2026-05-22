<!--
  Endgame for operators who declined the photosensitivity warning. Just
  the word "goodbye" in giant grey letters on a black background. No
  interaction — the user has to reload to come back.

  A slow fade-in for the word so it doesn't slap on screen; otherwise
  static. The font size uses a clamp so it scales gracefully from
  small viewports up to large displays.
-->
<div class="goodbye">
  <span class="word">goodbye</span>
</div>

<style>
  .goodbye {
    position: fixed;
    inset: 0;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .word {
    font-family: inherit;
    font-size: clamp(4rem, 18vw, 20rem);
    font-weight: bold;
    color: #555555;
    letter-spacing: 0.04em;
    user-select: none;
    animation: goodbye-fade-in 900ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
    opacity: 0;
  }
  @keyframes goodbye-fade-in {
    0%   { opacity: 0; transform: scale(0.97); }
    100% { opacity: 1; transform: scale(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .word {
      animation: none;
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
