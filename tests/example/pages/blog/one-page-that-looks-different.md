title: One page that looks different
theme: duckdown
css: poster
date: 2026-09-20
description: How a single page gets its own stylesheet without a layout of its own.

# One page that looks different

A centred title, a tinted page, much larger type — and nothing else on this site changed.

One line of front matter did it:

```markdown
title: One page that looks different
css: poster
```

That links `/static/poster.css` after the site's stylesheet and after the theme,
so the file only has to say what differs. Everything it doesn't mention — the
code blocks, the callouts, the link colours — still comes from `site.css`.

Because the file reaches exactly one page, it can use plain selectors like
`body h1` without having to guard them behind a class. That would be reckless in
a theme, which every page gets; here it is the point.

The name must be a plain word, so a page can't reach out of `static/`, and a
name with no file simply links nothing rather than breaking the page.

> [!NOTE]
> Reach for this when *one* page has to look unusual. If a whole section should
> read differently, a [[/guide/themes|theme]] is less to maintain; if the page
> wants a different *shape* rather than a different look, it wants a
> [[a-post-with-its-own-layout|layout]].
