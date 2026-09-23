title: Gallery by year
collection: gallery
description: The same collection, grouped by the year each work was made.

# Gallery by year

The same four works as the [gallery](/gallery/), grouped by their `year` field
instead of by the sections they are filed under. The screenprint says
`year: skip`, so it isn't here at all.

Each work here is drawn by `templates/tile.html` — the tag says
`template=tile` — so it shows its caption as well as its title. The
gallery's own page names no template, and gets the plain thumbnails.

{{items by=year template=tile}}
