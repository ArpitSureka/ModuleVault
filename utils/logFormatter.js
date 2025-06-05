/**
 * Log formatter utilities to standardize log formats
 */

/**
 * Format an error object for logging
 * @param {Error} error - The error object to format
 * @returns {Object} - Formatted error object for logging
 */
const formatError = (error) => {
  if (!error) return { message: 'Unknown error' };
  
  return {
    message: error.message || 'Unknown error',
    name: error.name || 'Error',
    stack: error.stack,
    code: error.code,
    status: error.status
  };
};

/**
 * Format a response object for logging
 * @param {Object} res - Express response object
 * @returns {Object} - Formatted response data for logging
 */
const formatResponse = (res) => {
  return {
    statusCode: res.statusCode,
    statusMessage: res.statusMessage,
    headers: res.getHeaders ? res.getHeaders() : {}
  };
};

/**
 * Format user information for logging
 * @param {Object} req - Express request object
 * @returns {Object} - Formatted user data for logging
 */
const formatUser = (req) => {
  return {
    id: req.userId || 'anonymous',
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
    referer: req.headers.referer
  };
};

/**
 * Format request context for logging
 * @param {Object} req - Express request object
 * @returns {Object} - Formatted request context for logging
 */
const formatRequestContext = (req) => {
  return {
    method: req.method,
    url: req.originalUrl || req.url,
    path: req.path,
    query: req.query,
    params: req.params,
    host: req.hostname || req.headers.host,
    protocol: req.protocol,
    requestId: req.requestId,
    headers: filterSensitiveHeaders(req.headers),
    timestamp: new Date().toISOString()
  };
};

/**
 * Filter out sensitive information from headers
 * @param {Object} headers - Request headers
 * @returns {Object} - Filtered headers
 */
const filterSensitiveHeaders = (headers) => {
  const filtered = { ...headers };
  
  // Filter out sensitive headers
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'set-cookie'];
  sensitiveHeaders.forEach(header => {
    if (filtered[header]) {
      filtered[header] = '[FILTERED]';
    }
  });
  
  return filtered;
};

/**
 * Create standardized log metadata
 * @param {Object} req - Express request object
 * @param {Object} [options] - Additional options
 * @returns {Object} - Standardized log metadata
 */
const createLogMetadata = (req, options = {}) => {
  const metadata = {
    requestId: req.requestId,
    user: formatUser(req),
    request: formatRequestContext(req)
  };
  
  if (options.error) {
    metadata.error = formatError(options.error);
  }
  
  if (options.performance) {
    metadata.performance = req.getPerformanceSummary ? req.getPerformanceSummary() : options.performance;
  }
  
  if (options.response) {
    metadata.response = formatResponse(options.response);
  }
  
  if (options.data) {
    metadata.data = options.data;
  }
  
  return metadata;
};

module.exports = {
  formatError,
  formatResponse,
  formatUser,
  formatRequestContext,
  createLogMetadata
};
