# Templates

A template is the frame every page sits in: the head, the menu, the footer.
It is HTML, with a few words in braces that duckdown fills in.

| Write | Becomes |
|-------|---------|
| `{{content}}` | The page itself |
| `{{title}}` | The page's title |
| `{{description}}` | Its description, and the card a shared link shows |
| `{{nav}}` | The site's menu |
| `{{date}}` | The page's date, written out |
| `{{url}}` | The page's own address |
| `{{css}}` | The page's extra stylesheet, if it asks for one |
| `{{edit}}` | An "Edit this page" link, only for you |
| `{{include topbar}}` | The template `topbar.html`, pulled in here |
| `{{x-anything}}` | The page's own `x-anything:` line |

A page picks a different template with `layout:` at its top. While a template
is open, the preview shows the page you're on through your unsaved version.
