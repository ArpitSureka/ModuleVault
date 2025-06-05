const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// List all available log files
router.get('/files', async (req, res) => {
  try {
    // Only admins should access this endpoint in production
    // Add your authentication/authorization check here
    
    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
      return res.status(404).json({
        success: false,
        message: 'Logs directory not found',
        requestId: req.requestId
      });
    }
    
    req.checkpoint('reading_log_files');
    const logFiles = fs.readdirSync(logsDir)
      .filter(file => file.endsWith('.log'))
      .map(file => ({
        name: file,
        path: `/api/logs/view/${file}`,
        size: fs.statSync(path.join(logsDir, file)).size,
        created: fs.statSync(path.join(logsDir, file)).birthtime
      }))
      .sort((a, b) => b.created - a.created); // Sort by most recent first
    
    req.logger.info('Log files listed', {
      count: logFiles.length,
      user: req.userId
    });
    
    return res.json({
      success: true,
      requestId: req.requestId,
      data: {
        logFiles
      }
    });
  } catch (error) {
    req.logger.error('Error listing log files', {
      error: {
        message: error.message,
        stack: error.stack
      }
    });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to list log files',
      error: error.message,
      requestId: req.requestId
    });
  }
});

// View contents of a specific log file
router.get('/view/:filename', async (req, res) => {
  try {
    // Only admins should access this endpoint in production
    // Add your authentication/authorization check here
    
    const { filename } = req.params;
    const { lines = 100, filter } = req.query;
    
    // Prevent path traversal attacks
    if (filename.includes('..')) {
      req.logger.warn('Potential path traversal attempt', {
        filename,
        ip: req.ip,
        user: req.userId
      });
      
      return res.status(400).json({
        success: false,
        message: 'Invalid filename',
        requestId: req.requestId
      });
    }
    
    const logsDir = path.join(__dirname, '../logs');
    const logPath = path.join(logsDir, filename);
    
    if (!fs.existsSync(logPath)) {
      return res.status(404).json({
        success: false,
        message: 'Log file not found',
        requestId: req.requestId
      });
    }
    
    req.checkpoint('reading_log_content');
    
    // Read the log file content
    let logContent = fs.readFileSync(logPath, 'utf8');
    let logEntries = logContent.split('\n').filter(Boolean);
    
    // Apply filtering if specified
    if (filter) {
      logEntries = logEntries.filter(entry => entry.includes(filter));
    }
    
    // Limit the number of lines
    logEntries = logEntries.slice(-parseInt(lines));
    
    // Parse JSON log entries if possible
    const parsedEntries = logEntries.map(entry => {
      try {
        return JSON.parse(entry);
      } catch (e) {
        return entry;
      }
    });
    
    req.logger.info('Log file viewed', {
      filename,
      lines: parseInt(lines),
      filter: filter || 'none',
      user: req.userId
    });
    
    return res.json({
      success: true,
      requestId: req.requestId,
      data: {
        filename,
        entries: parsedEntries,
        totalEntries: logEntries.length,
        filteredFrom: logContent.split('\n').filter(Boolean).length
      }
    });
  } catch (error) {
    req.logger.error('Error viewing log file', {
      error: {
        message: error.message,
        stack: error.stack
      },
      filename: req.params.filename
    });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to view log file',
      error: error.message,
      requestId: req.requestId
    });
  }
});

// Get statistics based on logs
router.get('/stats', async (req, res) => {
  try {
    // Only admins should access this endpoint in production
    // Add your authentication/authorization check here
    
    const { period = '24h' } = req.query;
    const logsDir = path.join(__dirname, '../logs');
    
    if (!fs.existsSync(logsDir)) {
      return res.status(404).json({
        success: false,
        message: 'Logs directory not found',
        requestId: req.requestId
      });
    }
    
    // Calculate the time threshold based on the period
    const now = new Date();
    let threshold = new Date(now);
    
    switch (period) {
      case '1h':
        threshold.setHours(now.getHours() - 1);
        break;
      case '6h':
        threshold.setHours(now.getHours() - 6);
        break;
      case '24h':
        threshold.setHours(now.getHours() - 24);
        break;
      case '7d':
        threshold.setDate(now.getDate() - 7);
        break;
      case '30d':
        threshold.setDate(now.getDate() - 30);
        break;
      default:
        threshold.setHours(now.getHours() - 24);
    }
    
    // Find the most recent combined log file
    const logFiles = fs.readdirSync(logsDir)
      .filter(file => file.includes('combined'))
      .sort()
      .reverse();
    
    if (logFiles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No log files found',
        requestId: req.requestId
      });
    }
    
    // Read the most recent log file
    const logPath = path.join(logsDir, logFiles[0]);
    const logContent = fs.readFileSync(logPath, 'utf8');
    const logEntries = logContent.split('\n').filter(Boolean);
    
    // Initialize stats
    const stats = {
      totalRequests: 0,
      endpoints: {},
      errors: 0,
      userStats: {},
      requestIds: new Set(),
      responseStatusCodes: {},
      averageResponseTime: 0,
      totalResponseTime: 0
    };
    
    // Process log entries
    for (const entry of logEntries) {
      try {
        const log = JSON.parse(entry);
        
        // Skip entries older than the threshold
        const logTime = new Date(log.timestamp);
        if (logTime < threshold) continue;
        
        // Count total requests
        if (log.request && log.request.method && log.request.url) {
          stats.totalRequests++;
          
          // Track unique request IDs
          if (log.requestId) {
            stats.requestIds.add(log.requestId);
          }
          
          // Count by endpoint
          const endpoint = `${log.request.method} ${log.request.url.split('?')[0]}`;
          stats.endpoints[endpoint] = (stats.endpoints[endpoint] || 0) + 1;
          
          // Count by user
          if (log.userId && log.userId !== 'anonymous') {
            stats.userStats[log.userId] = stats.userStats[log.userId] || { count: 0, endpoints: {} };
            stats.userStats[log.userId].count++;
            stats.userStats[log.userId].endpoints[endpoint] = (stats.userStats[log.userId].endpoints[endpoint] || 0) + 1;
          }
        }
        
        // Count errors
        if (log.level === 'error') {
          stats.errors++;
        }
        
        // Count response status codes
        if (log.request && log.request.statusCode) {
          const statusCode = log.request.statusCode.toString();
          stats.responseStatusCodes[statusCode] = (stats.responseStatusCodes[statusCode] || 0) + 1;
        }
        
        // Track response times
        if (log.performance && log.performance.total) {
          stats.totalResponseTime += log.performance.total;
        }
      } catch (e) {
        // Skip entries that can't be parsed
        continue;
      }
    }
    
    // Calculate average response time
    if (stats.totalRequests > 0) {
      stats.averageResponseTime = stats.totalResponseTime / stats.totalRequests;
    }
    
    // Convert Set to count for unique request IDs
    stats.uniqueRequests = stats.requestIds.size;
    delete stats.requestIds;
    
    req.logger.info('Log stats generated', {
      period,
      totalRequests: stats.totalRequests,
      errors: stats.errors,
      user: req.userId
    });
    
    return res.json({
      success: true,
      requestId: req.requestId,
      data: {
        period,
        stats
      }
    });
  } catch (error) {
    req.logger.error('Error generating log stats', {
      error: {
        message: error.message,
        stack: error.stack
      }
    });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to generate log statistics',
      error: error.message,
      requestId: req.requestId
    });
  }
});

module.exports = router;
