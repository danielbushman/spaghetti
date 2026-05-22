/**
 * Bun plugin for loading Svelte 5 components and rune-using modules.
 *
 * Bun has no first-party Svelte support; this is the minimum needed to make
 * `.svelte` files and `.svelte.ts` rune stores compile through Bun.build.
 *
 * Pipeline:
 *   .svelte file
 *     → svelte/preprocess (strip TS from <script lang="ts"> via Bun.Transpiler)
 *     → svelte/compile (generate: 'client', css: 'injected')
 *
 *   .svelte.ts / .svelte.js (Svelte 5 modules that use runes outside components)
 *     → strip TS if .ts
 *     → svelte/compileModule
 */
import type { BunPlugin } from "bun";
import { compile, compileModule, preprocess } from "svelte/compiler";

const tsTranspiler = new Bun.Transpiler({ loader: "ts" });

function stripTs(source: string): string {
  return tsTranspiler.transformSync(source);
}

export function sveltePlugin(): BunPlugin {
  const dev = process.env.NODE_ENV !== "production";

  return {
    name: "svelte",
    setup(build) {
      // .svelte components
      build.onLoad({ filter: /\.svelte$/ }, async (args) => {
        const source = await Bun.file(args.path).text();

        const processed = await preprocess(
          source,
          {
            script: ({ content, attributes }) => {
              const lang = attributes.lang;
              if (lang === "ts" || lang === "typescript") {
                return { code: stripTs(content) };
              }
              return { code: content };
            },
          },
          { filename: args.path },
        );

        const result = compile(processed.code, {
          filename: args.path,
          generate: "client",
          dev,
          css: "injected",
        });

        for (const w of result.warnings ?? []) {
          const where = w.start ? `${args.path}:${w.start.line}:${w.start.column}` : args.path;
          console.warn(`[svelte] ${where}: ${w.message}`);
        }

        return { contents: result.js.code, loader: "js" };
      });

      // .svelte.ts / .svelte.js — modules that use runes ($state, $derived, $effect).
      build.onLoad({ filter: /\.svelte\.(ts|js)$/ }, async (args) => {
        let source = await Bun.file(args.path).text();
        if (args.path.endsWith(".ts")) source = stripTs(source);
        const result = compileModule(source, {
          filename: args.path,
          generate: "client",
          dev,
        });
        for (const w of result.warnings ?? []) {
          const where = w.start ? `${args.path}:${w.start.line}:${w.start.column}` : args.path;
          console.warn(`[svelte] ${where}: ${w.message}`);
        }
        return { contents: result.js.code, loader: "js" };
      });
    },
  };
}
