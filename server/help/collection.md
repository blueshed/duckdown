# A collection

A collection is a folder of works kept as data — a picture, a title, a
caption — and shown by pages. You edit the works below the folder's page.

## Working on the works

- **Click a work** to open it in the drawer on the left: its picture, its
  words, and buttons to move it or remove it.
- **Drop a picture** on a group's last tile (the one with +) to add a work.
- **Drop a picture on a work's own picture** in the drawer to replace it —
  the work keeps its address.
- **Drag a work** to another place or group. Groups have their own arrows.
- **⌘Z** undoes, **⇧⌘Z** redoes. Every change is saved as you make it.
- **Renaming a work** keeps its old address working, and says so.

## Showing the works on a page

```md
{{items}}
```

On the folder's `index.md`: the works in their groups, as thumbnails.

```md
{{items by=year sort=asc}}
```

The same works grouped by a field instead — oldest year first.

```md
collection: works

{{items by=prints}}
```

On a page in another folder: `collection:` at the top says which works.

A work whose field says `skip` is left out of `by=` lists.
