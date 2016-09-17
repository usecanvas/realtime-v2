'use strict';

const Raven = require('raven');
const _     = require('lodash');

let client;
if (process.env.SENTRY_DSN) {
  client = new Raven.Client(process.env.SENTRY_DSN);
}

module.exports = {
  captureRequestMessage: captureRequestMessage,
  captureRequestException: captureRequestException,
  captureException: captureException,
};

function captureRequestException(req, err, opts) {
  if (!client) { return };
  opts = _.merge(requestInfo(req), opts);
  captureException(err, opts);
}

function captureRequestMessage(req, message, opts) {
  if (!client) { return };
  opts = _.merge(requestInfo(req), opts);
  captureMessage(message, opts);
}

function requestInfo(req) {
  let protocol;
  if (req.headers.upgrade === 'websocket') {
    protocol = req.connection.encrypted ? 'wss' : 'ws';
  } else if (req.headers['x-forwarded-proto']) {
    protocol = req.headers['x-forwarded-proto'];
  } else {
    protocol = req.connection.encrypted ? 'https' : 'http';
  }

  const host     = req.headers.host;
  const url      = `${protocol}://${host}${req.url}`;
  const ip       = req.headers['x-forwarded-for'] ||
    req.connection.remoteAddress;

  return {
    user: { ip_address: ip },
    extra: { request_id: req.headers['x-request-id'], },
    tags: { url: url }
  };
}

function captureMessage() {
  if (!client) { return };
  return client.captureMessage.apply(client, arguments);
}

function captureException() {
  if (!client) { return };
  return client.captureException.apply(client, arguments);
}
