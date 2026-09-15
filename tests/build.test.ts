/**
 * Build smoke test (T4). Proves, in wave 1, that:
 *
 *   - the cockpit still builds and its html lands under `cockpit/`;
 *   - a console entry that imports a `.css` file emits `console.js` and a
 *     sibling `console.css` under the `entry` naming (so the console's
 *     index.html can rely on `<link href="/console.css">`);
 *   - a missing console entry is a logged skip, never a throw.
 *
 * The console entry here is a throwaway written into a tmp dir, so the test
 * does not depend on the real console (a later wave).
 *
 *   bun test tests/build.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildClient, buildConsole } from "../src/build";

// Hex survives Bun's CSS normalisation unchanged (rgb() would be rewritten to hex).
const RULE = ".t4-probe{color:#010203}";

let tmp = "";
let out = "";
let entry = "";
let html = "";

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "spaghetti-build-"));
  out = join(tmp, "out");
  entry = join(tmp, "main.ts");
  html = join(tmp, "index.html");

  await writeFile(join(tmp, "t.css"), `${RULE}\n`);
  await writeFile(entry, `import './t.css';\nexport const probe = 't4';\nconsole.log(probe);\n`);
  await writeFile(
    html,
    `<!doctype html><html><head><link rel="stylesheet" href="/console.css"></head>` +
      `<body><div id="app"></div><script type="module" src="/console.js"></script></body></html>\n`,
  );

  await buildClient(out);
  await buildConsole(out, entry, html);
}, 120_000);

afterAll(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

describe("buildClient", () => {
  test("emits the cockpit bundle at the root and its html under cockpit/", () => {
    expect(existsSync(join(out, "main.js"))).toBe(true);
    expect(existsSync(join(out, "cockpit", "index.html"))).toBe(true);
  });

  test("the cockpit html still references /main.js at the root", async () => {
    const text = await Bun.file(join(out, "cockpit", "index.html")).text();
    expect(text).toContain('src="/main.js"');
  });
});

describe("buildConsole", () => {
  test("emits console.js, console.css and the root index.html", () => {
    expect(existsSync(join(out, "console.js"))).toBe(true);
    expect(existsSync(join(out, "console.css"))).toBe(true);
    expect(existsSync(join(out, "index.html"))).toBe(true);
  });

  test("the root index.html references /console.js", async () => {
    const text = await Bun.file(join(out, "index.html")).text();
    expect(text).toContain("/console.js");
  });

  test("the imported css reaches console.css, not the js bundle", async () => {
    const css = await Bun.file(join(out, "console.css")).text();
    expect(css).toContain(".t4-probe");
    expect(css).toContain("#010203");
    const js = await Bun.file(join(out, "console.js")).text();
    expect(js).not.toContain(".t4-probe");
  });

  test("a missing entry logs a skip and resolves without throwing", async () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
    try {
      await expect(buildConsole(out, join(tmp, "nope", "main.ts"), html)).resolves.toBeUndefined();
    } finally {
      console.log = original;
    }
    expect(lines.some((l) => l.includes("[build] console entry missing, skipping"))).toBe(true);
  });
});
