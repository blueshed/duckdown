// create/setup.ts deletes things, so it only ever runs here on a scratch
// copy of the repo's shape, never on the repo itself.
import { describe, test, expect, spyOn } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { RUN } from "./helpers";
import { setup } from "../create/setup";

describe("bun create setup", () => {
  const root = join(RUN, "my-site");

  test("turns a clone into a fresh site", async () => {
    for (const dir of ["tests/example/static", "tests/example/templates", ".claude/skills/duckdown", ".claude/skills/railroad", "create", "server"]) {
      mkdirSync(join(root, dir), { recursive: true });
    }
    writeFileSync(join(root, "tests", "example", "static", "site.css"), ":root { --accent: red; }");
    writeFileSync(join(root, "tests", "example", "static", "theme.css"), "/* this site's own look */");
    writeFileSync(join(root, "tests", "example", "templates", "site.html"), "<body>{{content}}</body>");
    writeFileSync(join(root, ".claude", "skills", "duckdown", "SKILL.md"), "the authoring skill");
    writeFileSync(join(root, ".claude", "skills", "railroad", "SKILL.md"), "for working on duckdown itself");
    writeFileSync(join(root, ".claude", "launch.json"), "{}");
    for (const file of ["feature.md", "todo.jsonl", "bunfig.toml", "create/setup.ts", "server/main.ts"]) writeFileSync(join(root, file), "x");
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      await setup(root);
    } finally {
      log.mockRestore();
    }

    for (const gone of ["tests", "feature.md", "todo.jsonl", "bunfig.toml", "create", ".claude/skills/railroad"]) {
      expect(existsSync(join(root, gone))).toBe(false);
    }
    // A new site keeps what it needs to write its own content
    expect(existsSync(join(root, ".claude", "skills", "duckdown", "SKILL.md"))).toBe(true);
    expect(existsSync(join(root, ".claude", "launch.json"))).toBe(true);
    expect(existsSync(join(root, "server", "main.ts"))).toBe(true);
    expect(readFileSync(join(root, "site", "pages", "index.md"), "utf8")).toStartWith("title: my-site\n\n# Welcome to my-site");
    expect(readFileSync(join(root, "site", "templates", "site.html"), "utf8")).toBe("<body>{{content}}</body>"); // the seed's
    expect(readFileSync(join(root, "site", "static", "site.css"), "utf8")).toBe(":root { --accent: red; }"); // the seed's
    expect(readFileSync(join(root, "site", "static", "theme.css"), "utf8")).toBe("/* this site's own look */");
    const users = JSON.parse(readFileSync(join(root, "site", "users.json"), "utf8"));
    expect(await Bun.password.verify("admin", users.admin)).toBe(true);
    expect(readFileSync(join(root, ".env"), "utf8")).toStartWith("DUCKDOWN_PATH=./site\n");
  });

  test("leaves an existing site folder alone", async () => {
    writeFileSync(join(root, "site", "pages", "index.md"), "mine");
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      await setup(root);
    } finally {
      log.mockRestore();
    }
    expect(readFileSync(join(root, "site", "pages", "index.md"), "utf8")).toBe("mine");
  });
});
