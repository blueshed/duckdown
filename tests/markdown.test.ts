import { describe, test, expect } from "bun:test";
import { parseFrontMatter, renderMarkdown } from "../server/markdown";

describe("parseFrontMatter", () => {
  test("parses key-value pairs", () => {
    const { meta, body } = parseFrontMatter("title: Hello\ntheme: dark\n\n# Content");
    expect(meta.title).toEqual(["Hello"]);
    expect(meta.theme).toEqual(["dark"]);
    expect(body).toBe("# Content");
  });

  test("handles multiple values for same key", () => {
    const { meta } = parseFrontMatter("tag: one\ntag: two\n\nbody");
    expect(meta.tag).toEqual(["one", "two"]);
  });

  test("returns full source when no front-matter", () => {
    const { meta, body } = parseFrontMatter("# Just markdown\n\nNo metadata here.");
    expect(Object.keys(meta)).toHaveLength(0);
    expect(body).toBe("# Just markdown\n\nNo metadata here.");
  });

  test("handles empty input", () => {
    const { meta, body } = parseFrontMatter("");
    expect(Object.keys(meta)).toHaveLength(0);
    expect(body).toBe("");
  });

  test("lowercases keys", () => {
    const { meta } = parseFrontMatter("Title: Foo\nTHEME: bar\n\nbody");
    expect(meta.title).toEqual(["Foo"]);
    expect(meta.theme).toEqual(["bar"]);
  });

  test("handles keys with hyphens", () => {
    const { meta } = parseFrontMatter("x-script-src: foo.js\n\nbody");
    expect(meta["x-script-src"]).toEqual(["foo.js"]);
  });

  test("stops at first non-metadata line", () => {
    const { meta, body } = parseFrontMatter("title: Hello\n# Heading\n\nParagraph");
    expect(meta.title).toEqual(["Hello"]);
    expect(body).toBe("# Heading\n\nParagraph");
  });
});

describe("renderMarkdown", () => {
  test("renders basic markdown", () => {
    const { content } = renderMarkdown("# Hello\n\nWorld");
    expect(content).toContain("<h1>");
    expect(content).toContain("Hello");
  });

  test("strips front-matter from output", () => {
    const { content, meta } = renderMarkdown("title: Test\n\n# Heading");
    expect(meta.title).toEqual(["Test"]);
    expect(content).not.toContain("title:");
    expect(content).toContain("Heading");
  });

  test("renders GFM tables", () => {
    const { content } = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(content).toContain("<table>");
  });

  test("renders strikethrough", () => {
    const { content } = renderMarkdown("~~deleted~~");
    expect(content).toContain("<del>");
  });
});
