---
description: "Release duckdown (patch | minor | major) and bring every site that runs it onto the tag; `sites` brings them onto the newest tag without releasing; with no argument, show where everything stands."
argument-hint: "[patch | minor | major | tag | sites]"
---

# /release

A duckdown release isn't out until the sites run it. This takes `master` to a tag, then each site
that depends on duckdown onto that tag, each by its own CLAUDE.md. `$ARGUMENTS` is:

- `patch`, `minor` or `major`: release, then the sites.
- `tag`: the version `package.json` already has, untagged: steps 2 and 4, then the sites.
- `sites`: skip to step 6, the newest tag to the sites still behind it.
- nothing: change nothing, and report the state (step 0).

Anything else: stop and print `Usage: /release [patch|minor|major|tag|sites]`.

Running this is the authority to release and deploy. Carry it through without asking again,
except where a step below says to ask. CLAUDE.md's "A release, and the sites that run it" says why
each step is there.

## 0. No argument: the state

Change nothing. Run `git fetch`, then `bun run sites`, and print:

- **duckdown:** the version in `package.json`, the newest tag, and whether they match (an untagged
  version is ready to tag); the branch, whether the tree is clean, and how far it is ahead of or
  behind `origin/master`; whether `CHANGELOG.md` has an `## Unreleased` section, and how many
  entries.
- **The sites:** the table `bun run sites` prints, and what it says is not yet on the tag.
- **What to run next**, in one line:
  - `/release patch` (or `minor`/`major`) when there are unreleased entries;
  - `/release tag` when the version is already bumped and untagged (a merged fix came with its own
    bump and changelog entry; never bump on top of a version that was never tagged);
  - `/release sites` when the tag is out and sites are behind;
  - nothing, when every site is on the tag, deployed and live.

## 1. Preflight

1. On `master`, with a clean tree (`git status --porcelain` prints nothing), and not behind
   `origin/master` (`git fetch`, then `git rev-list --count HEAD..origin/master` is `0`).
2. `CHANGELOG.md` has a `## Unreleased` section with something under it. It is what every site
   reads when `duckdown upgrade` prints it, so what a site must do itself is said there.
3. The release's diff (`git diff v<last>..HEAD`) has had a simplicity pass: KISS, DRY, YAGNI,
   clean. If it hasn't, do one first (`/simplify`), and keep a cut only if step 2 still passes
   with it.
4. `bun run sites`: see where every site stands before anything changes.

## 2. Gate

`bun run test` (100% coverage) and `bun run check`. Never run them under `git rebase --exec`: a
test that runs git inherits `GIT_DIR` and writes into this repo's config (todo n180).

## 3. Version

For `tag`, skip this step and the changelog check in 1.2: the version and its entry are already
there, and step 4 tags them.

Parse `version` in `package.json` as `x.y.z` and bump it (`patch` → `x.y.(z+1)`, `minor` →
`x.(y+1).0`, `major` → `(x+1).0.0`). In `CHANGELOG.md`, replace `## Unreleased` with
`## X.Y.Z — YYYY-MM-DD`, today's date, as the entries below it read.

## 4. Commit, tag, push

```
git add package.json CHANGELOG.md
git commit -m "0.17.3: search shards no longer start with _"   # X.Y.Z: what it does
git tag vX.Y.Z
git push && git push origin vX.Y.Z
```

A pushed tag is what sites install. Never move one. If something is wrong after the push, fix it on
`master` and release the next patch.

## 5. Tell the sessions

List the Claude sessions working on duckdown or on a site (`ListAgents`). Tell each the release is
out and which of its sites you are about to upgrade, and leave a site to its session if it is still
making it, or asks you to. A site whose deploy ships the folder as it stands (`railway up`) is
asked first. Wait for an answer for as long as the site's own steps take; silence means skip that
site and say so. Tell them again when their site is done.

## 6. Each site

`bun run sites` lists every folder under `~/Workshop` whose `package.json` depends on
`github:blueshed/duckdown` (`archive/` skipped), and what each runs live. For each site behind the
tag, in its own folder, **read its CLAUDE.md and follow its steps**; they differ. In outline:

1. Its git tree is clean. If not, skip it and say so.
2. Content that lives elsewhere comes home first: a served site's bucket
   (`railway run --service <name> bunx duckdown bucket pull`, or its own `bun run pull`), with
   what it brings committed on its own.
3. `bunx duckdown upgrade X.Y.Z`. Read what it compares. A page or file that differs beyond what
   the CHANGELOG says this release changes is a reason to stop that site and report.
4. Do what the CHANGELOG asks of a site.
5. `git status --untracked-files=all`: no `.dist.next-*` or `.dist.old-*` folder is committed or
   shipped. Delete one if it's there, and say so.
6. Commit `package.json`, `bun.lock` and the skill, worded as that site's last upgrade commit, with
   a line in its ledger if it keeps one.
7. Deploy it its own way: a push (Railway's GitHub source builds it), or `railway up` from a
   clean tree. A served site is started
   locally once first, where its CLAUDE.md allows it.
8. Check: `/health` says `OK duckdown X.Y.Z`; the home page and one inner page are 200;
   `X-Content-Type-Options: nosniff` is on them, and `Content-Security-Policy: sandbox` on a
   `/static/` file.

If a step fails, leave that site as it was: never force anything. Go on to the next.

**Rules that hold whatever a site's CLAUDE.md says:**

- **vashti:** her bucket holds her words. Pull and commit it first; never overwrite or reseed it.
- **dash:** it answers a real Google Sheet.
  - Never POST to `/rsvp` (it writes a guest's answer and a Changes row), and never open a real
    guest's link. The check is `/rsvp?g=not-a-real-code` answering 404.
  - Never start it locally: its `.env` holds the real Sheet key. Its tests are the check before a
    deploy, and a failing test means no deploy.
  - Tell its session before you begin.
- **daisy:** `railway up` ships the folder as it stands. The tree must be clean, and its session
  asked.
- **MostlyMovies:** Peter's own, shared with his son Oliver (Dash). Its remote is Oliver's GitHub
  repository, and pushing to it is fine; it deploys by `railway up`, not by the push.
- **blueshed/website:** a push to `main` is its deploy, and Peter presses it. Commit the upgrade,
  then stop and say it is ready to push.
- **blueshed/duckdown-forms:** another session's, linked to duckdown's working copy. Leave it.

## 7. Report

Run `bun run sites` until every site's row is on the tag, live included, or says why it isn't.
Its `deployed` column must be `push <commit>, HEAD` or a `railway up` time with no "not
deployed" after it: a site whose live version is right but whose deploy isn't HEAD isn't done.
`git` says `no upstream` for a site with no remote (daisy, dash); that is expected. Then report:

```
Released duckdown X.Y.Z (tag vX.Y.Z).

  site             live     commit    how
  <one row per site, with what its comparison showed; skipped ones with why>
```
