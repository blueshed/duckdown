# Notes, links and lists of pages

A few things this site does that plain markdown doesn't.

## A note that stands out

```example
> [!NOTE]
> The shop is closed on Mondays.
```

`[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` and `[!CAUTION]` work the same way, each
in its own colour.

## A link to another page here

```md
[[news]] or [[news|the latest news]]
```

Double square brackets and the page's name — no `/` and no `.html`. The part
after `|` is the words the link shows.

## A contents list

Put `toc: true` at the top of a long page and its sections are listed under
the title, each a link.

## A list of the pages in a folder

```md
{{pages}}
```

On a folder's `index.md`, this becomes a list of the other pages in that
folder, newest first. `{{sitemap}}` is every page on the site.

## Words the page shows as they are

Anything between backticks is shown exactly as typed: `` `{{pages}}` `` shows
the braces instead of a list.
