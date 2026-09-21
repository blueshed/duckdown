title: A post with its own layout
layout: post
date: 2026-09-21
description: What layout: is for, demonstrated by the page you are reading.

# A post with its own layout

This page is wrapped in `templates/post.html` instead of `templates/site.html`,
because its front matter says so:

```markdown
title: A post with its own layout
layout: post
date: 2026-09-21
```

Look at what that changed. There is no site navigation at the top — a post is
something you arrived at, not somewhere you browse from — and there is a way
back to the blog instead. At the foot is the date, which this template asks for
with `{{date}}`.

A layout is any file in `templates/`. The name must be a plain word, so a page
can't reach out of that folder, and if the template isn't there the page falls
back to `site.html` rather than failing.

> [!TIP]
> Use a layout when a kind of page wants a different *shape* — a post, a
> landing page, something to print; the template it names can link whatever
> stylesheets that kind needs. When one single page should look different,
> give that page a [[/guide/themes|`css:`]] instead.
