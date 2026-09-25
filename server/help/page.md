# Writing a page

A page is plain text. A few marks make it look like more. In each example,
what you type is at the top and what readers see is under it.

## Headings

```example
## A heading
### A smaller one
```

Start a line with `#` marks and a space. Use `##` for the page's sections and
`###` under those. The page's own title usually has one `#`.

## Bold, italic, crossed out

```example
**bold**, *italic*, ~~crossed out~~
```

## Links

```example
[the news page](/news/) and [a site elsewhere](https://example.com)
```

The words go in square brackets, the address in round ones. An address on
this site starts with `/`.

## Pictures

```example
![Two birds on a wire, against a grey sky](/static/images/birds.jpg)
```

Like a link with `!` in front. The words in the brackets matter: say what the
picture shows. They are read aloud to someone who can't see it, and shown if
the picture doesn't load. Upload a picture from **Resources**, click it, and
**Copy Markdown** gives you the line to paste.

## Lists

```example
- apples
- pears

1. first
2. second

- [x] done
- [ ] not yet
```

## Tables

```example
| Year | Album |
|------|-------|
| 1970 | Just Another Diamond Day |
| 2005 | Lookaftering |
```

A line of `|---|` under the first row makes it the heading row.

## A quote

```example
> Just another diamond day.
```

## A line across

```example
---
```

On a line of its own, with an empty line above.

## Line breaks

A new paragraph needs an empty line between. To break a line without starting
a new paragraph — a poem, a lyric — end the line with two spaces.
