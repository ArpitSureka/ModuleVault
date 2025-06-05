const expressWinston = require('express-winston');
const winston = require('winston');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Express Winston request logger middleware
const requestLogger = expressWinston.logger({
  winstonInstance: logger,
  meta: true,
  metaField: 'request',
  requestWhitelist: ['method', 'url', 'httpVersion', 'originalUrl', 'query', 'headers.authorization', 'headers.x-user-id'],
  responseWhitelist: ['statusCode'],
  bodyWhitelist: ['package', 'name', 'version', 'id'],
  bodyBlacklist: ['password', 'token', 'secret', 'key'],
  ignoredRoutes: ['/health', '/favicon.ico'],
  colorize: process.env.NODE_ENV === 'development',
  requestFilter: (req, propName) => {
    if (propName === 'headers' && req.headers.authorization) {
      const headers = {...req.headers};
      if (headers.authorization) {
        headers.authorization = 'Bearer [FILTERED]';
      }
      return headers;
    }
    return req[propName];
  }
});

// Express Winston error logger middleware
const errorLogger = expressWinston.errorLogger({
  winstonInstance: logger,
  meta: true,
  metaField: 'error',
  requestWhitelist: ['method', 'url', 'httpVersion', 'originalUrl', 'query'],
  blacklistedMetaFields: ['trace', 'os', 'process']
});

module.exports = {
  requestLogger,
  errorLogger
};
