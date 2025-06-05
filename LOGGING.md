# ModuleVault Advanced Logging System

## Overview

ModuleVault includes a comprehensive logging system to help you monitor and troubleshoot your application in production environments. The logging system provides:

- Request tracing with unique request IDs
- User activity tracking
- Performance monitoring
- Log rotation and management
- Log levels for different environments
- JSON-formatted logs for machine parsing
- Human-readable console logs for development
- REST API endpoints for log management

## Log Levels

The logging system uses the following log levels:

- **error**: Critical errors that affect application functionality
- **warn**: Warnings that don't stop application functionality but need attention
- **info**: General information about application operation (default)
- **debug**: Detailed information for troubleshooting
- **silly**: Very detailed debugging information

## Request Tracing

Each incoming request is assigned a unique request ID, which is included in all logs related to that request. This makes it easy to trace a user's journey through the system. The request ID is also returned in the response headers (`X-Request-ID`) and in the response body when appropriate.

### Example:
```javascript
// In your route handlers, use the request-scoped logger:
router.get('/your-endpoint', (req, res) => {
  // Log something with the request context included
  req.logger.info('Processing request', { additionalData: 'value' });
  
  // Add a performance checkpoint
  req.checkpoint('database_query_start');
  
  // ... perform some operations ...
  
  req.checkpoint('database_query_complete');
  
  // Get performance summary
  const performance = req.getPerformanceSummary();
  req.logger.debug('Performance info', { performance });
  
  res.json({
    success: true,
    requestId: req.requestId,
    data: { /* your response data */ }
  });
});
```

## Configuring Log Levels

You can configure the log level using the `LOG_LEVEL` environment variable:

```
LOG_LEVEL=debug npm start
```

## Log Files

In production environments, logs are saved to the `logs` directory:

- `YYYY-MM-DD-error.log` - Contains only error logs
- `YYYY-MM-DD-info.log` - Contains info level and above logs
- `YYYY-MM-DD-combined.log` - Contains all logs

Logs are automatically rotated daily and compressed after 14 days.

## Log Management API

The system includes REST API endpoints for log management:

- `GET /api/logs/files` - Lists all available log files
- `GET /api/logs/view/:filename` - Views the contents of a specific log file
- `GET /api/logs/stats` - Provides statistics based on log data

**Important**: These endpoints should be secured in production to prevent unauthorized access.

## Client-Side Request Tracing

When making requests from client applications, you can pass a custom `X-Request-ID` header to ensure that the same request ID is used throughout the entire system. If you don't provide one, the server will generate a unique ID.

```javascript
// Client-side example
fetch('https://your-api.com/endpoint', {
  headers: {
    'X-Request-ID': 'custom-request-id',
    'X-User-ID': 'user-123' // Optional: help trace user activity
  }
})
```

## Monitoring User Activity

To trace a specific user's activities:

1. Use the log viewer API: `GET /api/logs/view/:filename?filter=user-123`
2. Search log files for a specific user ID
3. Check user statistics: `GET /api/logs/stats`

## Performance Monitoring

The logging system includes built-in performance monitoring:

- Request duration tracking
- Custom checkpoints for specific operations
- Performance summaries in log output

This information can help identify bottlenecks and optimize your application.
