title: One page that looks different
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

That links `/static/poster.css` after the site's stylesheet and after every
theme that reaches this page, so the file only has to say what differs.
Everything it doesn't mention — the code blocks, the callouts, the link
colours — still comes from `site.css`.

A theme and this are the same kind of file; what differs is how far each one
reaches. A `-theme.css` is served to every page in its folder, so restyling
`h1` there restyles a whole section. This one is served to a single page, which
is why it can restyle whatever it likes.

The name must be a plain word, so a page can't reach out of `static/`, and a
name with no file simply links nothing rather than breaking the page.

> [!NOTE]
> Reach for this when *one* page has to look unusual. If a whole section should
> read differently, a [[/guide/themes|theme]] is less to maintain; if the page
> wants a different *shape* rather than a different look, it wants a
> [[a-post-with-its-own-layout|layout]].
