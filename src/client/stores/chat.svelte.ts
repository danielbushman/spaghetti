/**
 * Chat state + typewriter pump.
 *
 * Each Message has BOTH a `visible` (what the screen shows) and a `target`
 * (what the agent intends to say, which may still be growing during a
 * stream). A small async loop walks `visible` toward `target` at typewriter
 * cadence (see motion/typing.ts), so the screen reads as the agent thinking
 * rather than as a printer.
 *
 * `history` is what we send to Ollama. It is *separate* from `messages`:
 * system-log lines ("// ollama: ok") never go to the LLM.
 *
 * Why Message is a class, not a POJO:
 *   When you push a plain object into a `$state` array, Svelte 5 wraps the
 *   array in a proxy and lazily wraps objects accessed through it. Mutations
 *   on the *original* reference (the one we kept after pushing) bypass that
 *   proxy and don't trigger reactivity. Class instance fields decorated with
 *   `$state` runes have per-field reactive accessors, so any reference —
 *   original or re-fetched — mutates reactively. This eliminated a bug
 *   where `message.typing = false` looked correct in state but the cursor
 *   stayed in the DOM forever.
 */
import {
  adaptiveCharDelayMs,
  charDelayMs,
  rhythmModulator,
  thinkingPauseMs,
  wordBoundaryPauseMs,
} from "../motion/typing";

export type Role = "system" | "user" | "agent";

type HistoryEntry = {
  role: "system" | "user" | "assistant";
  content: string;
};

let nextId = 1;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Reduce a chat-failure response body to a single readable line.
 *
 * Our /api/chat wraps Ollama errors as `{"error": "ollama returned 400: {...}"}`,
 * where the inner `{...}` is another JSON document with Ollama's own
 * `{"error": "..."}` message. We dig through both layers so the surfaced
 * line reads as the human cause, not the transport.
 *
 *   raw body:       {"error":"ollama returned 400: {\"error\":\"\\\"foo\\\" does not support chat\"}"}
 *   surfaced line:  "foo" does not support chat
 */
function prettyChatError(body: string, status: number, statusText: string): string {
  if (!body) return statusText || `status ${status}`;
  try {
    const env = JSON.parse(body) as { error?: string };
    const outer = env.error ?? body;
    const innerMatch = outer.match(/^ollama returned \d+: (\{.*\})$/);
    if (innerMatch) {
      try {
        const inner = JSON.parse(innerMatch[1]) as { error?: string };
        if (typeof inner.error === "string") return inner.error;
      } catch {
        // Inner wasn't JSON after all; fall back to the outer message.
      }
    }
    return outer;
  } catch {
    return body;
  }
}

export class Message {
  readonly id: number;
  readonly ts: number;
  role = $state<Role>("system");
  visible = $state("");
  target = $state("");
  typing = $state(false);

  constructor(init: {
    role: Role;
    visible?: string;
    target?: string;
    typing?: boolean;
  }) {
    this.id = nextId++;
    this.ts = Date.now();
    this.role = init.role;
    this.visible = init.visible ?? "";
    this.target = init.target ?? "";
    this.typing = init.typing ?? false;
  }
}

class ChatStore {
  messages = $state<Message[]>([]);
  history = $state<HistoryEntry[]>([]);

  setSystemPrompt(p: string): void {
    this.history = [{ role: "system", content: p }];
  }

  /** User message lands instantly — no typewriter for what they themselves wrote. */
  pushUserInstant(text: string): void {
    this.messages.push(
      new Message({ role: "user", visible: text, target: text, typing: false }),
    );
    this.history.push({ role: "user", content: text });
  }

  /** Type a system/log line in. Not recorded in LLM history. */
  typeSystem(text: string): Promise<void> {
    return this.typeIn("system", text, /* recordHistory */ false);
  }

  /** Type an out-of-band agent line in (e.g. the hardcoded opener). */
  typeAgent(text: string): Promise<void> {
    return this.typeIn("agent", text, /* recordHistory */ true);
  }

  private async typeIn(
    role: Role,
    text: string,
    recordHistory: boolean,
  ): Promise<void> {
    const m = new Message({ role, target: text, typing: true });
    this.messages.push(m);
    await this.pump(m);
    m.typing = false;
    if (recordHistory) {
      this.history.push({ role: "assistant", content: text });
    }
  }

  /**
   * Stream a response from /api/chat using current history. Tokens land in
   * `target` as they arrive; the typewriter pump drains `target` → `visible`
   * at typing cadence. Returns when both the stream and the pump are done.
   *
   * `systemAddendum`, if provided, is a one-shot system instruction appended
   * to the history for *this turn only*. Used to drive scene beats (triage,
   * fix acknowledgement) without polluting the persistent system prompt.
   */
  async streamAgentTurn(
    model: string,
    options?: Record<string, unknown>,
    systemAddendum?: string,
  ): Promise<void> {
    const m = new Message({ role: "agent", typing: true });
    this.messages.push(m);

    const history = systemAddendum
      ? [...this.history, { role: "system" as const, content: systemAddendum }]
      : this.history;

    const { error } = await this.runStreamingInto(m, history, model, options);
    m.typing = false;

    if (error) {
      m.role = "system";
      m.visible = `// chat failed: ${error}`;
      m.target = m.visible;
      return;
    }

    const final = m.target.trim();
    if (!final) {
      m.role = "system";
      m.visible = "// agent stayed silent";
      m.target = m.visible;
      return;
    }
    this.history.push({ role: "assistant", content: final });
  }

  /**
   * Like `streamAgentTurn` but uses a temporary system instruction appended
   * to the history (for the silence check-in). Returns the produced text or
   * null if the model returned nothing usable.
   *
   * Removes the message bubble entirely on failure so a dropped check-in
   * leaves no trace.
   */
  async streamCheckin(
    model: string,
    instruction: string,
  ): Promise<string | null> {
    const m = new Message({ role: "agent", typing: true });
    this.messages.push(m);

    const checkinHistory: HistoryEntry[] = [
      ...this.history,
      { role: "system", content: instruction },
    ];

    const { error } = await this.runStreamingInto(m, checkinHistory, model, {
      num_predict: 60,
      temperature: 0.95,
      top_p: 0.92,
      repeat_penalty: 1.25,
      repeat_last_n: 256,
      presence_penalty: 0.6,
      frequency_penalty: 0.5,
    });
    m.typing = false;

    if (error) {
      this.removeMessage(m.id);
      return null;
    }

    const final = m.target.trim().replace(/^"+|"+$/g, "");
    if (!final || final.toLowerCase().startsWith("are you still")) {
      this.removeMessage(m.id);
      return null;
    }
    this.history.push({ role: "assistant", content: final });
    return final;
  }

  /**
   * Two-task runner: a receive task fills `m.target` from the stream, a
   * display task drains `target` → `visible` at typing cadence. Both finish
   * before this resolves.
   */
  private async runStreamingInto(
    m: Message,
    history: HistoryEntry[],
    model: string,
    options?: Record<string, unknown>,
  ): Promise<{ error: string | null }> {
    let receiveDone = false;
    let receiveError: string | null = null;

    const receive = async (): Promise<void> => {
      try {
        const r = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            messages: history,
            options: options ?? { num_predict: 200, temperature: 0.85 },
          }),
        });
        if (!r.ok || !r.body) {
          const text = await r.text().catch(() => "");
          receiveError = prettyChatError(text, r.status, r.statusText);
          return;
        }
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let tail = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          tail += decoder.decode(value, { stream: true });
          const lines = tail.split("\n");
          tail = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line) as {
                message?: { content?: string };
                done?: boolean;
              };
              const tok = data.message?.content ?? "";
              if (tok) m.target = m.target + tok;
              if (data.done) return;
            } catch {
              // Non-JSON line — skip.
            }
          }
        }
      } catch (e) {
        receiveError = e instanceof Error ? e.message : String(e);
      } finally {
        receiveDone = true;
      }
    };

    // Display: drain target → visible at typewriter cadence.
    //
    // Five signals compose the per-char delay:
    //   1. `adaptiveCharDelayMs` — base shape scaled by buffer pressure.
    //      When Ollama runs ahead, the floor drops so we don't perceptibly
    //      lag the model.
    //   2. `rhythmModulator` — slow sine wave around 1.0; gives the cadence
    //      natural ebb and flow without changing the average.
    //   3. `wordBoundaryPauseMs` — added beat after a word ends.
    //   4. `thinkingPauseMs` — extra delay at syntactic positions where a
    //      real typist hesitates (post-sentence-start, post-comma, ellipsis,
    //      em-dash, occasional mid-flow word break).
    //   5. Backlog gate — when the buffer is large (> 20 chars), we're in
    //      catch-up mode; skip the breath, word-end, and thinking pauses
    //      so the flush stays fast.
    const display = async (): Promise<void> => {
      let prevCh: string | null = null;
      while (true) {
        const backlog = m.target.length - m.visible.length;
        if (backlog > 0) {
          const ch = m.target[m.visible.length];
          m.visible = m.target.slice(0, m.visible.length + 1);
          const remaining = backlog - 1;
          const base = adaptiveCharDelayMs(ch, remaining);
          if (remaining > 20) {
            await sleep(base); // fast flush — skip the layered modulators
          } else {
            const breath = rhythmModulator(performance.now());
            const boundary = wordBoundaryPauseMs(ch, prevCh);
            const think = thinkingPauseMs(ch, prevCh, m.visible);
            await sleep(base * breath + boundary + think);
          }
          prevCh = ch;
        } else if (receiveDone) {
          return;
        } else {
          await sleep(15);
        }
      }
    };

    await Promise.all([receive(), display()]);
    return { error: receiveError };
  }

  /** Drain a fully-known string into `visible` at typewriter cadence. */
  private async pump(m: Message): Promise<void> {
    while (m.visible.length < m.target.length) {
      const ch = m.target[m.visible.length];
      m.visible = m.target.slice(0, m.visible.length + 1);
      await sleep(charDelayMs(ch));
    }
  }

  private removeMessage(id: number): void {
    const i = this.messages.findIndex((x) => x.id === id);
    if (i >= 0) this.messages.splice(i, 1);
  }
}

export const chat = new ChatStore();
