// Contrast, by rule. Every colour the editor and the base site draw text or
// a control's edge with is a token, and every pair a reader meets is held to
// WCAG AA here, light and dark: 4.5:1 for text, 3:1 for a field's edge and a
// focus ring (1.4.3, 1.4.11). A colour change that fails one fails this.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

type Tokens = Record<string, string>;

const declarations = (block: string): Tokens =>
  Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name!, value!.trim()]));

// A stylesheet's tokens as the reader gets them: the top-level :root, and in
// dark mode that with the prefers-color-scheme block's over it. Linked after
// another (theme.css after site.css), its own :root outranks the other's dark
// block too, as the cascade has it — but the other's light values don't.
function schemes(css: string, under: { light: Tokens; dark: Tokens } = { light: {}, dark: {} }) {
  const own = declarations(css.match(/(?:^|\n):root\s*\{([^}]*)\}/)?.[1] ?? "");
  const ownDark = declarations(css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/)?.[1] ?? "");
  return { light: { ...under.light, ...own }, dark: { ...under.dark, ...own, ...ownDark } };
}

type RGB = [number, number, number];

function colour(tokens: Tokens, name: string): RGB {
  const value = tokens[name];
  if (value === undefined) throw new Error(`no --${name}`);
  const ref = value.match(/^var\(--([\w-]+)\)$/);
  if (ref) return colour(tokens, ref[1]!);
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hex) throw new Error(`--${name} is ${value}, which this test can't read: write it as a hex`);
  const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join("") : hex[1]!;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
}

// color-mix(in srgb, top pct%, transparent) laid over base.
const over = (top: RGB, pct: number, base: RGB): RGB =>
  top.map((c, i) => Math.round(c * pct + base[i]! * (1 - pct))) as RGB;

const luminance = (rgb: RGB) => {
  const [r, g, b] = rgb.map((c) => c / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

function ratio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const TEXT = 4.5;
const EDGE = 3;

// What each pair is, so a failure says where a reader meets it.
type Pair = [what: string, fg: (t: Tokens) => RGB, bg: (t: Tokens) => RGB, min: number];
const token = (name: string) => (t: Tokens) => colour(t, name);

function holds(tokens: Tokens, pairs: Pair[]) {
  const failing = pairs
    .map(([what, fg, bg, min]) => ({ what, min, got: Math.round(ratio(fg(tokens), bg(tokens)) * 100) / 100 }))
    .filter(({ got, min }) => got < min);
  expect(failing).toEqual([]);
}

describe("the editor", () => {
  const css = read("server/edit/styles.css");
  const { light, dark } = schemes(css);
  // A folder's name on the tree's hover shade (color-mix: --border 50% over --surface).
  const hover = (t: Tokens) => over(colour(t, "border"), 0.5, colour(t, "surface"));
  const pairs: Pair[] = [
    ...["bg", "surface", "paper"].flatMap((bg): Pair[] => [
      [`text on ${bg}`, token("text"), token(bg), TEXT],
      [`quieter text on ${bg}`, token("text-dim"), token(bg), TEXT],
      [`accent text (folder names) on ${bg}`, token("accent-text"), token(bg), TEXT],
      [`red text (errors, Delete) on ${bg}`, token("danger-text"), token(bg), TEXT],
      [`a text field's edge on ${bg}`, token("field-border"), token(bg), EDGE],
      [`the focus ring on ${bg}`, token("focus"), token(bg), EDGE],
    ]),
    ["a folder's name on the hover shade", token("accent-text"), hover, TEXT],
    ["a primary button's words", token("on-accent"), token("accent"), TEXT],
    ["a primary button's words, hovered", token("on-accent"), token("accent-hover"), TEXT],
    ["a danger button's words, and a failure's notice", token("on-accent"), token("danger"), TEXT],
    ["a danger button's words, hovered", token("on-accent"), token("danger-hover"), TEXT],
    ["Saved", token("on-accent"), token("ok"), TEXT],
    ["the notice's news", token("on-accent"), token("news"), TEXT],
  ];

  test("every pair passes in light", () => holds(light, pairs));
  test("every pair passes in dark", () => holds(dark, pairs));

  // So a new colour can't skip the pairs above: outside the token blocks, a
  // colour is a var(). (Shadows and the backdrop are rgba(): not text.)
  test("draws no colour that isn't a token", () => {
    const outside = css.split("\n").filter((line) => /#[0-9a-f]{3,6}\b/i.test(line) && !/^\s*--[\w-]+:/.test(line));
    expect(outside).toEqual([]);
    expect(read("server/edit/login.html").match(/#[0-9a-f]{3,6}\b/gi)).toBeNull();
  });
});

describe("the base site, and the seed's theme over it", () => {
  const base = schemes(read("server/base/site.css"));
  const themed = schemes(read("tests/example/static/theme.css"), base);
  const pairs: Pair[] = [
    ...["bg", "surface"].flatMap((bg): Pair[] => [
      [`text on ${bg}`, token("text"), token(bg), TEXT],
      [`muted text on ${bg}`, token("muted"), token(bg), TEXT],
      [`a link on ${bg}`, token("accent"), token(bg), TEXT],
      [`the search box's edge on ${bg}`, token("field-border"), token(bg), EDGE],
    ]),
    ["the focus ring", token("accent"), token("bg"), EDGE],
    // A callout is its tone at 8% over the page, titled in the tone itself.
    ...["note", "tip", "important", "warning", "caution"].flatMap((tone): Pair[] => {
      const tint = (t: Tokens) => over(colour(t, tone), 0.08, colour(t, "bg"));
      return [
        [`a ${tone} callout's title`, token(tone), tint, TEXT],
        [`a ${tone} callout's text`, token("text"), tint, TEXT],
      ];
    }),
  ];

  test("every pair passes in light", () => holds(base.light, pairs));
  test("every pair passes in dark", () => holds(base.dark, pairs));
  test("and with the seed's theme, in light", () => holds(themed.light, pairs));
  test("and with the seed's theme, in dark", () => holds(themed.dark, pairs));
});

test("ratio is WCAG's: black on white is 21, a colour on itself 1", () => {
  expect(ratio([0, 0, 0], [255, 255, 255])).toBe(21);
  expect(ratio([88, 86, 214], [88, 86, 214])).toBe(1);
});
