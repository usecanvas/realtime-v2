'use strict';

const ShareDB = require('sharedb');
const ShareDBPostgresCanvas = require('./lib/sharedb-postgres-canvas');
const ShareDBRedisPubSub = require('sharedb-redis-pubsub');
const Sidekiq = require('sidekiq');
const WebSocketJSONStream = require('websocket-json-stream');
const WebSocketServer = require('ws').Server;
const { authenticate, getUserID } = require('./lib/authenticate');
const db = new ShareDBPostgresCanvas();
const pubsub = new ShareDBRedisPubSub(process.env.REDIS_URL);
const redis = require('redis').createClient();
const shareDBLogger = require('sharedb-logger');
const sidekiq = new Sidekiq(redis, 'exq');

const CANVAS_URL = new RegExp(`^${process.env.WEB_URL}/[^/]+/([^/]{22})$`, 'i');

module.exports = function shareDBWsServer(server, options) {
  options = options || {};
  options.server = options.server || server;
  const webSocketServer = new WebSocketServer(options);
  webSocketServer.on('connection', onWSConnection);
};

function onWSConnection(wsConn) {
  const stream = new WebSocketJSONStream(wsConn);
  const shareDB = new ShareDB({ db, pubsub });
  // if (process.env.NODE_ENV !== 'production') shareDBLogger(shareDB);
  shareDB.use('connect', authenticate);
  shareDB.use('receive', pingPong);
  shareDB.use('after submit', checkTrackbacks);
  shareDB.listen(stream);
}

function checkTrackbacks(req, cb) {
  const newTrackbacks = req.op.op.filter(isTrackback);
  const oldTrackbacks = req.op.op.filter(isUntrackback);

  newTrackbacks.forEach(trackback => {
    const id = trackback.li.meta.url.match(CANVAS_URL)[1];

    sidekiq.enqueue(
      'CanvasAPI.CanvasTrackback.Worker',
      ['add', id, req.op.d, req.agent.stream.ws.accountID], {
        queue: 'default'
      });
  });

  oldTrackbacks.forEach(trackback => {
    const id = trackback.ld.meta.url.match(CANVAS_URL)[1];

    sidekiq.enqueue(
      'CanvasAPI.CanvasTrackback.Worker',
      ['remove', id, req.op.d, req.agent.stream.ws.accountID], {
        queue: 'default'
      });
  });

  cb();
}

function isTrackback(comp) {
  if (comp.p.length > 1) return false;
  if (!comp.li) return false;
  return isCanvasTrackback(comp.li);
}

function isUntrackback(comp) {
  if (comp.p.length > 1) return false;
  if (!comp.ld) return false;
  return isCanvasTrackback(comp.ld);
}

function isCanvasTrackback(part) {
  return part.type === 'url' && CANVAS_URL.test(part.meta.url);
}

function pingPong(req, cb) {
  if (!req.data.ping) return cb();
  return req.agent.send({ pong: true });
}
