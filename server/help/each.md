# The page every work gets

This page is a pattern: every work in the folder's collection gets its own
page made from it. It is never a page itself.

```md
each: true
title: {{item-title}}

![{{item-title}}]({{item-src}})

{{item-caption}}

{{prev}} {{next}}
```

| Write | Becomes |
|-------|---------|
| `{{item-title}}` | The work's title (any field works: `{{item-year}}`) |
| `{{item-src}}` | The work's picture |
| `{{item-thumb}}` | Its small picture |
| `{{prev}}` `{{next}}` | Links to the works either side |
| `{{group}}` | The name of the group it is in |
| `{{groups}}` | The collection's sections, as a menu |

The preview shows the first work's page, so you can see the pattern as you
write it.
