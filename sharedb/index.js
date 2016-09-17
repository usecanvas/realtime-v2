'use strict';

const ShareDB = require('sharedb');
const ShareDBRedisPubSub = require('sharedb-redis-pubsub');
const ShareDBPostgresCanvas = require('./lib/sharedb-postgres-canvas');
const WebSocketJSONStream = require('websocket-json-stream');
const WebSocketServer = require('ws').Server;
const shareDBLogger = require('sharedb-logger');

module.exports = function shareDBWsServer(server, options) {
  options = options || {};
  options.server = options.server || server;
  const webSocketServer = new WebSocketServer(options);
  webSocketServer.on('connection', onWSConnection);
};

function onWSConnection(wsConn) {
  const db = new ShareDBPostgresCanvas();
  const pubsub = new ShareDBRedisPubSub(process.env.REDIS_URL);
  const stream = new WebSocketJSONStream(wsConn);
  const shareDB = new ShareDB({ db, pubsub });
  if (process.env.NODE_ENV !== 'production') shareDBLogger(shareDB);
  shareDB.use('receive', pingPong);
  shareDB.listen(stream);
}

function pingPong(req, cb) {
  if (!req.data.ping) return cb();
  return req.agent.send({ pong: true });
}
