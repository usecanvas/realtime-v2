# Canvas Realtime [![Deploy][heroku_button_svg]][heroku_deploy]

This app serves as the realtime component of canvas. It runs a
[ShareDB][sharedb] server, which provides operational transformation for
operations on canvases.

## Dependencies

See [app.json][app_json] for details about environment variables for the
following dependencies.

- **PostgreSQL**: The realtime server needs to read from and write to the API's
  PostgreSQL database instance in order to read and write operations and
  canvas document states.
- **Redis** (1): The realtime server needs a connection to the API's Redis
  instance so that it can trigger jobs based on certain incoming operations.
- **Redis** (2): ShareDB uses Redis for caching of operations. This can be the
  same Redis instance as the API Redis instance, if need be.

## Running on Heroku

After [deploying the Canvas API][canvas_api_readme], this app can be deployed
using the Heroku button above. After the app is created, attach the API's
PostgreSQL and Redis addons:

```
$ heroku addons:attach $API_DATABASE_ADDON_NAME --as DATABASE
$ heroku addons:attach $API_REDIS_ADDON_NAME --as API_REDIS
```

[app_json]: https://github.com/usecanvas/pro-realtime/blob/master/app.json
[canvas_api_readme]: https://github.com/usecanvas/pro-api/blob/master/README.md
[heroku_button_svg]: https://www.herokucdn.com/deploy/button.svg
[heroku_deploy]: https://heroku.com/deploy?template=https://github.com/usecanvas/pro-realtime
[sharedb]: https://github.com/share/sharedb
