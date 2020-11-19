# duckdown

A light weight Markdown site.


### Deploy ###

To deploy with heroku you would:

```
heroku container:login
heroku create duckdown
heroku container:push web
heroku container:release web
heroku open
```
