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

That links `/static/poster.css` after the stylesheets the template already
links, so the file only has to say what differs. Everything it doesn't
mention — the code blocks, the callouts, the link colours — still comes from
`site.css`.

It is the same kind of file as `theme.css`; the difference is who gets it.
`theme.css` is in the template, so every page has it, and restyling `h1` there
restyles the site. This one is named by a single page, which is why it can
restyle whatever it likes.

The name must be a plain word, so a page can't reach out of `static/`, and a
name with no file simply links nothing rather than breaking the page.

> [!NOTE]
> Reach for this when *one* page has to look unusual. If a whole kind of page
> should read differently, give it a [[a-post-with-its-own-layout|layout]] and
> let that template link the stylesheet — then no page has to remember.
