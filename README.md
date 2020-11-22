# duckdown

A light weight markdown site.

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
