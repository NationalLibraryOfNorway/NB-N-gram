# NB-N-gram
This is the official repository of [NB N-Gram](http://www.nb.no/sp_tjenester/beta/ngram_1/), created by [Språkbanken](http://www.nb.no/Tilbud/Forske/Spraakbanken) at the [National Library of Norway](http://www.nb.no/). In its current form NB N-gram is a trend viewer, similar to [Google Ngram Viewer](https://books.google.com/ngrams). It shows you the development of words or sequences of words in the vast material digitized at the National Library of Norway, but it is also perfectly adoptable to other corpora. This repository contains both the backend, written in Python/Flask, and the frontend, written in HTML/JavaScript.

## Install
To install:

1. Create a virtual environment and install the packages in `requirements.txt`
2. Download the SQLite databases from [Språkbanken's repository](http://www.nb.no/sprakbanken/show?serial=sbr-35&lang=en) or provide your own data
3. Configure the paths to the databases and the database schema in `backend.py`
4. Set the environment variable `FLASK_NGRAM_SETTINGS` to point to your Flask configuration file (eg. different settings for production and development machines): an example development configruation file is found in `flask-example-devsettings.cfg`
5. Start the session with `python backend.py`, listens at 127.0.0.1:5000 per default (for development only!) or run it behind a WSGI server like UWSGI or Gunicorn (production use)

## License
NB N-gram is released under the Apache 2.0 license.
