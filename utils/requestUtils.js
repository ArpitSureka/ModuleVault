import { v4 as uuidv4 } from 'uuid';
import logger from './logger.js';

/**
 * Middleware to assign a unique request ID to each incoming request
 * This allows for tracing requests through the logs
 */
const requestTracker = (req, res, next) => {
  // Generate a unique request ID
  const requestId = req.headers['x-request-id'] || uuidv4();
  
  // Store it on the request object
  req.requestId = requestId;
  
  // Add it to response headers
  res.setHeader('X-Request-ID', requestId);
  
  // Identify user if authentication is available
  if (req.user) {
    req.userId = req.user.id || 'anonymous';
  } else if (req.headers['x-user-id']) {
    req.userId = req.headers['x-user-id'];
  } else {
    req.userId = 'anonymous';
  }
  
  // Create a request-scoped logger
  req.logger = logger.child({ 
    requestId: req.requestId,
    userId: req.userId,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent']
  });
  
  // Log the incoming request
  req.logger.info(`Incoming request: ${req.method} ${req.originalUrl || req.url}`);
  
  // Log response on finish
  res.on('finish', () => {
    const logMethod = res.statusCode >= 400 ? 'warn' : 'info';
    req.logger[logMethod](`Request completed: ${req.method} ${req.originalUrl || req.url} - Status: ${res.statusCode}`);
  });
  
  next();
};

/**
 * Add a performance tracking helper to the request
 */
const performanceTracker = (req, res, next) => {
  // Initialize performance markers
  req.performanceMarkers = {
    start: process.hrtime(),
    checkpoints: {}
  };
  
  // Add checkpoint method to request
  req.checkpoint = (name) => {
    req.performanceMarkers.checkpoints[name] = process.hrtime();
    return req;
  };
  
  // Add performance summary method
  req.getPerformanceSummary = () => {
    const summary = {
      total: getElapsedMs(req.performanceMarkers.start),
      checkpoints: {}
    };
    
    Object.keys(req.performanceMarkers.checkpoints).forEach(checkpoint => {
      summary.checkpoints[checkpoint] = getElapsedMs(req.performanceMarkers.checkpoints[checkpoint]);
    });
    
    return summary;
  };
  
  next();
};

// Helper to calculate elapsed time in milliseconds
function getElapsedMs(startTime) {
  const diff = process.hrtime(startTime);
  return (diff[0] * 1e9 + diff[1]) / 1e6; // Convert to milliseconds
}

export {
  requestTracker,
  performanceTracker
};
