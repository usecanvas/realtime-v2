'use strict';

const HTTP     = require('http');
const Koa      = require('koa');
const koaSSL   = require('koa-ssl');
const Logger   = require('./lib/logger');
const Sentry   = require('./services/sentry');
const shareDBWsServer = require('./sharedb');

const app = new Koa();
const server = HTTP.createServer();

if (process.env.NODE_ENV === 'production') {
  app.use(koaSSL({ trustProxy: true }));
}

app.use(function* catchError(next) {
  try {
    yield next;
  } catch (err) {
    Logger.error(err);
    Sentry.captureRequestException(this.req, err);
    this.body =
      { id: 'unexpected', message: 'An unexpected message occurred.' };
  }
});

app.use(function* (next) {
  if (this.method === 'GET' && this.path === '/health') {
    this.body = 'ok';
    return;
  }

  if (this.method === 'GET' && this.path === '/boom') {
    throw new Error('boom');
  }

  yield next;
});

shareDBWsServer(server);
server.on('request', app.callback());
server.listen(process.env.PORT, onServerListen);

function onServerListen() {
  Logger.log({ event: `listening on port ${this.address().port}` });
}
