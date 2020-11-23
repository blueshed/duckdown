# duckdown

Duckdown is a [tornado](https://tornadoweb.org) application.
It uses python-markdown to convert pages to html dynamically and then
presents those pages though tornado templates. This provides an easy syntax for users to
edit their content and developers the ability to style the presentation.

The templates, static files and pages can be hosted on Amazon S3. The
published site is static and can make use of CDN resources.  The
cost of hosting a site in this way would ¢ ranther than $ per month.

In order to make the site secure you would still need to host the site
in Route53 and provide Amazon hosted certificate and we're writing a
tool to automate that. The editing service can be provided by heroku
on a hobby server - the one I'm looking at now uses 38mb of the memory and 
idles at 0 load!

## Tools:

Duckdown installed is an invoke tool that you call from the command line.
```
% duckdown -l
Subcommands:

  create    create a duckdown app at path
  publish   generate public site
  run       run app
```

### create
```
% duckdown create site
```
This will create a folder in the current directory called site which
contains three folders: templates, static, pages.

- tempates: contains the site_tmpl.html used to render markdown pages
- static: contains resouces used by templates
- pages: contains markdown pages stating with index.md


### To use ###
```
python3 -m venv venv
source venv/bin/activate
pip install duckdown
duckdown create site
duckdown run site
```

You view the site on: http://localhost:8080

You can edit the site at http://localhost:8080/edit

the defaut username/password:
```
username: admin
password: admin
```

---

### Dev ###

```
python3 -m venv venv
source venv/bin/activate
pip install -r dev-requirements.txt
inv server
```
