'use strict';

const logger = require('logfmt').namespace({ source: 'canvas-realtime' });

logger.requestLogger = function requestLogger() {
  return function* middleware(next) {
    const data = {
      content_length: this.get('content-length'),
      content_type  : this.get('content-type'),
      ip            : this.get('x-forwarded-for'),
      method        : this.method,
      path          : this.originalUrl,
      request_id    : this.get('x-request-id'),
      time          : new Date().toISOString(),
    };

    const timer = logger.time('elapsed');

    yield next;

    data.status = this.status;
    timer.log(data);
  };
};

module.exports = logger;
