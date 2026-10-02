title: Another language

# Another language

A site can be in more than one language. You write the translations; duckdown
never does. It serves the right page, tells readers and search engines which
languages a page is in, and tells you when a translation has fallen behind the
page it came from.

## A folder per language

A language is a top-level folder named for it, whose `index.md` says so:

```markdown
lang: cy
title: Hafan
untranslated: Nid yw'r dudalen hon wedi'i chyfieithu eto.

# Croeso
```

`pages/cy/about.md` is then the translation of `pages/about.md`, at
`/cy/about.html`. The same path under the folder is the whole link between
them. The root's own `lang:` is the default language (`en` when it says
nothing); a folder with no `lang:` is a folder like any other.

## A page not translated yet

A request for a Welsh page that has no translation is answered with the
original, at the Welsh address, with a note above it — the words in
`untranslated:`, in that language. A draft translation counts as not
translated, so a reader keeps the original while you write.

## When the original changes

A translation says which version it was made from:

```markdown
title: Amdanom ni
translated-from: 3f9a1c2e
```

When the page changes, the editor marks the translation out of date and
`bun run export` lists it (`--strict` fails on it). Read what changed, make
yours say the same, and press **Mark up to date** in the editor. From a
terminal, `bunx duckdown translations status` lists them and
`bunx duckdown translations stamp cy/about.md` says one is current.

## What a template needs

```html
<html lang="{{lang}}">
...
<form class="search" role="search" data-root="{{root}}">
...
{{languages}}
```

`{{languages}}` links the page in each language, each in its own name. A file
`templates/site.cy.html` is the template for Welsh pages, with the words
around the page translated. Search, the navigation, `{{pages}}` and
`{{sitemap}}` all stay in the language.

See **Languages** in the authoring skill's reference for the rest: collections,
the sitemap, and the editor's Translations drawer.
