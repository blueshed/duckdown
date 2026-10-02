# Another language

A site can be in more than one language. You write the translations; duckdown
never translates. Each language is a folder named for it — `cy` for Welsh —
and a page there is the translation of the page with the same name outside it.

## Starting one

Open the **Translations** drawer, type a code (`cy`, `fr`, `pt-br`) and press
Add. It makes the home page in that language, as a draft, and says which
language it is:

```md
lang: cy
untranslated:
draft: true
translated-from: 3f9a1c2e

# Croeso
```

Write over the words. `untranslated:` is what readers are told, in that
language, when a page isn't translated yet — leave it empty and they are told
in English. Take `draft: true` off when the home page is ready.

## Translating a page

Open the page, and the bar above it lists each language. **Translate** makes
`cy/about.md` from `about.md`, as a draft, and opens it. Write over the words
and take `draft: true` off when it is done: until then readers get the original
page at the Welsh address, with a note that it isn't translated yet.

`translated-from` says which version of the page you translated from. It is
what lets duckdown tell you the original has changed.

## When the original changes

The tree marks a page whose translation has fallen behind (`cy ↻`), and a
folder says how many in it have. Open the translation, read what changed, make
yours say the same, and press **Mark up to date**. Readers aren't told: they
have your translation until you change it.

A translation that doesn't say what it was made from can't be checked. Press
**Mark up to date** when you know it is current.

`bun run export` lists the same: a translation that is out of date is reported
with the broken links, and `--strict` fails on it. From a terminal,
`bunx duckdown translations status` says where each stands, and
`bunx duckdown translations stamp cy/about.md` is **Mark up to date** for a page
(or a folder of them, or a collection's words).

## What readers get

- The page, in the language they chose, at `/cy/about.html`.
- A page that isn't translated: the original, at the Welsh address, with your
  note above it. It isn't searched for in Welsh and isn't in the sitemap.
- The language's own navigation, search and listings. `{{pages}}` and
  `{{sitemap}}` in a Welsh page are the Welsh site's.

## The words around the page

A template says "Skip to content" in one language. For another, copy it:
`templates/site.html` becomes `templates/site.cy.html`, with the words
translated. A template that includes another (`{{include topbar}}`) uses
`topbar.cy.html` in Welsh when there is one. Without one, the original is used.

Three placeholders make a template language-aware:

```md
<html lang="{{lang}}">
{{languages}}
<form class="search" data-root="{{root}}">
```

`{{lang}}` is the page's language, `{{languages}}` is a list that links the
page in each language (each in its own name), and `{{root}}` is where the
language's site begins (`/` or `/cy/`), so search stays in the language.

## A collection's words

A collection written once serves every language. In a language's folder, its
page opens the **words**: the original's title and caption above each box, and
yours in the box. Words you have typed for a work say what they were made from,
so a work whose original has changed is marked out of date. A work with none is
shown in the original's words, with the note.

Pictures, years and everything that isn't text are the original's.
