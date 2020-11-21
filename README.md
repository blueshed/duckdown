# duckdown

A light weight Markdown site.


### Dev ###

```
python3 -m venv venv
source venv/bin/activate
pip install -r dev-requirements.txt
inv server
```

### Deploy ###

To deploy with heroku you would:

```
heroku container:login
heroku create duckdown
heroku container:push web
heroku container:release web
heroku open
```

To attach to an existing heroku app

```
heroku container:login
heroku git:remote -a duckdown
```
