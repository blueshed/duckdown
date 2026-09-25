# The top of a page

The first lines of a page can say things about it — its title, whether it is
finished — before an empty line and the page itself.

```md
title: Lookaftering
description: Vashti's second album, from 2005.
date: 2005-10-24

# Lookaftering
```

| Line | What it does |
|------|--------------|
| `title:` | The page's name, in the browser tab and in search results |
| `description:` | A sentence about it, shown when the page is shared or found |
| `date:` | When it was written (`2026-09-25`): newest first in a folder's list |
| `draft: true` | Keeps it off the site until you take the line out |
| `nav:` | On a folder's `index.md`: its name in the site's menu |
| `order:` | On a folder's `index.md`: a number, for where it comes in the menu |
| `feed: true` | On a folder's `index.md`: its pages can be followed in a feed reader |
| `toc: true` | A list of the page's sections under its title |
| `image:` | The picture shown when the page is shared (`images/cover.jpg`); without one, the site's card (**Resources → icon**) |
| `aliases:` | An old address that should still lead here (`/old-page`) |
| `layout:` | Another template for this page (`post`) |
| `css:` | An extra stylesheet for this page (`poster`) |

Only these words work here — and words of your own that start with `x-`
(`x-buy: https://…`), which a template can show. If a line like `Update:
closed Monday` is the first thing on a page, it stays part of the page rather
than vanishing.

**Moving a page?** Use the page's rename button (beside Earlier versions): its
old address goes into `aliases:` by itself, so links to it keep working.
