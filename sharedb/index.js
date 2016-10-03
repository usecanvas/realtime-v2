'use strict';

const cookie = require('cookie');
const crypto = require('crypto');
const ShareDB = require('sharedb');
const shareDBLogger = require('sharedb-logger');
const ShareDBPostgresCanvas = require('./lib/sharedb-postgres-canvas');
const ShareDBRedisPubSub = require('sharedb-redis-pubsub');
const WebSocketJSONStream = require('websocket-json-stream');
const WebSocketServer = require('ws').Server;
const db = new ShareDBPostgresCanvas();
const pubsub = new ShareDBRedisPubSub(process.env.REDIS_URL);

const { SECRET_KEY_BASE, SIGNING_SALT } = process.env;

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
  shareDB.listen(stream);
}

function authenticate(req, cb) {
  crypto.pbkdf2(SECRET_KEY_BASE, SIGNING_SALT, 1000, 32, 'sha256',
    (err, key) => {
      const upgradeCookie = req.agent.stream.ws.upgradeReq.headers.cookie;
      const apiCookie = cookie.parse(upgradeCookie)._canvas_pro_api_key;
      const [algoName, payload, signature] = apiCookie.split('.');
      const plainText = algoName + '.' + payload;
      const challenge = crypto.createHmac('sha256', key);
      challenge.update(plainText);

      if (crypto.timingSafeEqual(challenge.digest(),
                                 Buffer.from(signature, 'base64'))) {
        cb();
      } else {
        cb(new Error('Invalid session cookie'));
      }
    })
}

function decode(cookiePart) {
  return Buffer.from(cookiePart, 'base64').toString();
}

function pingPong(req, cb) {
  if (!req.data.ping) return cb();
  return req.agent.send({ pong: true });
}
