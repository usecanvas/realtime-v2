'use strict';

const ShareDB = require('sharedb');
const ShareDBPostgresCanvas = require('./lib/sharedb-postgres-canvas');
const ShareDBRedisPubSub = require('sharedb-redis-pubsub');
const Sidekiq = require('sidekiq');
const WebSocketJSONStream = require('websocket-json-stream');
const WebSocket = require('ws');
const WebSocketServer = require('ws').Server;
const { authenticate, getUserID } = require('./lib/authenticate');
const db = new ShareDBPostgresCanvas();
const pubsub = new ShareDBRedisPubSub(process.env.REDIS_URL);
const redis = require('redis').createClient(process.env.API_REDIS_URL);
const shareDBLogger = require('sharedb-logger');
const sidekiq = new Sidekiq(redis, 'exq');

const CANVAS_URL = new RegExp(`^${process.env.WEB_URL}/[^/]+/([^/]{22})(?:#[^?]+)?(?:\\?.*)?`, 'i');

module.exports = function shareDBWsServer(server, options) {
  options = options || {};
  options.server = options.server || server;
  const webSocketServer = new WebSocketServer(options);
  webSocketServer.on('connection', onWSConnection);
};

function onWSConnection(wsConn) {
  const stream = new WebSocketJSONStream(wsConn);
  const shareDB = new ShareDB({ db, pubsub });
  if (process.env.NODE_ENV !== 'production') shareDBLogger(shareDB);
  shareDB.use('connect', authenticate);
  shareDB.use('receive', pingPong);
  shareDB.use('after submit', checkTrackbacks);
  shareDB.listen(stream);
  wsConn.heartbeatInterval = setInterval(_ => sendPong(wsConn), 30000);
}

function checkTrackbacks(req, cb) {
  const accountID = req.agent.stream.ws.accountID;
  if (!accountID) return cb();

  const newTrackbackIDs =
    req.op.op.filter(isTrackback('li')).map(extractIDs('li'));
  const oldTrackbackIDs =
    req.op.op.filter(isTrackback('ld')).map(extractIDs('ld'));

  newTrackbackIDs.forEach(trackbackID => {
    sidekiq.enqueue(
      'CanvasAPI.CanvasTrackback.Worker',
      ['add', trackbackID, req.op.d, accountID], {
        queue: 'default'
      });
  });

  oldTrackbackIDs.forEach(trackbackID => {
    sidekiq.enqueue(
      'CanvasAPI.CanvasTrackback.Worker',
      ['remove', trackbackID, req.op.d, accountID], {
        queue: 'default'
      });
  });

  cb();
}

function extractIDs(type) {
  return function _extractIDs(trackback) {
    return trackback[type].meta.url.match(CANVAS_URL)[1];
  };
}

function isTrackback(type) {
  return function _isTrackback(comp) {
    if (comp.p.length > 1) return false;
    if (!comp[type]) return false;
    return isCanvasTrackback(comp[type]);
  };
}

function isCanvasTrackback(part) {
  return part.type === 'url' && CANVAS_URL.test(part.meta.url);
}

function pingPong(req, cb) {
  if (!req.data.ping) return cb();
  return req.agent.send({ pong: true });
}

function sendPong(wsConn) {
  if (wsConn.readyState == WebSocket.OPEN) {
    wsConn.send(JSON.stringify({ pong: true }), err => {
      if (err) clearInterval(wsConn.heartbeatInterval);
    });
  } else {
    clearInterval(wsConn.heartbeatInterval);
  }
}
