const winston = require('winston');
const { createLogger, format, transports } = winston;
const { combine, timestamp, printf, colorize, json } = format;
const path = require('path');
require('winston-daily-rotate-file');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for development console logs
const devConsoleFormat = printf(({ level, message, timestamp, requestId, userId, ...metadata }) => {
  let logMessage = `${timestamp} [${level}]`;
  
  if (requestId) {
    logMessage += ` [reqId:${requestId}]`;
  }
  
  if (userId) {
    logMessage += ` [userId:${userId}]`;
  }
  
  logMessage += `: ${message}`;
  
  // Add any additional metadata if present
  if (Object.keys(metadata).length > 0) {
    logMessage += ` | ${JSON.stringify(metadata)}`;
  }
  
  return logMessage;
});

// Create a daily rotating file transport for different log levels
const fileRotateTransport = (level) => new transports.DailyRotateFile({
  filename: path.join(logsDir, `%DATE%-${level}.log`),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  level: level,
  format: combine(
    timestamp(),
    json()
  )
});

// Create the logger instance
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'module-vault' },
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    json()
  ),
  transports: [
    // Console transport for all environments
    new transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        devConsoleFormat
      )
    })
  ]
});

// Add file transports in non-development environments
if (process.env.NODE_ENV !== 'development') {
  logger.add(fileRotateTransport('error'));
  logger.add(fileRotateTransport('info'));
  
  // Special transport for all logs
  logger.add(new transports.DailyRotateFile({
    filename: path.join(logsDir, '%DATE%-combined.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    format: combine(
      timestamp(),
      json()
    )
  }));
}

// Add a stream for Morgan HTTP logger
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  }
};

module.exports = logger;
