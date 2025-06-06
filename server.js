import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import morgan from 'morgan';

// Import logging utilities
import logger from './utils/logger.js';
import { requestTracker, performanceTracker } from './utils/requestUtils.js';
import { requestLogger, errorLogger } from './utils/expressLogger.js';

import { connectDB } from './config/database.js';
import executableRoutes from './routes/executables.js';
import logRoutes from './routes/logs.js';
import swaggerOptions from './swagger.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function startServer() {
  const app = express();

  // Connect to MongoDB
  await connectDB();
  logger.info('Connected to database');

  // Create executables directory if it doesn't exist
  const executablesDir = path.join(__dirname, 'executables');
  if (!fs.existsSync(executablesDir)) {
    fs.mkdirSync(executablesDir, { recursive: true });
    logger.debug('Created executables directory');
  }

  // Middleware
  app.use(cors());
  
  // Request tracking middleware (must be before other middleware)
  app.use(requestTracker);
  app.use(performanceTracker);
  
  // HTTP request logging with Morgan (basic format for console)
  app.use(morgan('combined', { stream: logger.stream }));
  
  // Express-Winston request logging (detailed)
  app.use(requestLogger);
  
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Serve static executable files
  app.use('/download', express.static(executablesDir));

  // API Routes
  app.use('/api/executables', executableRoutes);
  app.use('/api/logs', logRoutes);

  // Swagger setup
  const swaggerSpec = swaggerJsdoc(swaggerOptions);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Health check endpoint
  app.get('/health', (req, res) => {
    // Example of using performance checkpoints
    req.checkpoint('health_check_start');
    
    // Check if logs directory exists and is writable
    const logsDir = path.join(__dirname, 'logs');
    let logsStatus = 'OK';
    
    try {
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      fs.accessSync(logsDir, fs.constants.W_OK);
    } catch (error) {
      logsStatus = `ERROR: ${error.message}`;
      req.logger.error('Logs directory check failed', { error });
    }
    
    req.checkpoint('health_check_complete');
    
    const healthData = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      logs: logsStatus,
      environment: process.env.NODE_ENV || 'development',
      uptime: Math.floor(process.uptime()) + 's',
      memory: process.memoryUsage(),
      performance: req.getPerformanceSummary()
    };
    
    req.logger.info('Health check completed', { healthData });
    res.json(healthData);
  });

  // Root endpoint with API documentation
  app.get('/', (req, res) => {
    res.json({
      message: 'Executable Converter API',
      version: '1.0.0',
      endpoints: {
        health: 'GET /health',
        search: 'GET /api/executables/search?query=<search_term>&page=<page>&limit=<limit>&repositoryManager=<npm|pip>',
        getExecutable: 'GET /api/executables/:id',
        downloadExecutable: 'POST /api/executables/download',
        listExecutables: 'GET /api/executables'
      },
      downloadEndpoint: '/download/<filename>'
    });
    
    // Example of checkpoint for performance tracking
    req.checkpoint('root_endpoint');
    req.logger.debug('Root endpoint request completed', { 
      performance: req.getPerformanceSummary() 
    });
  });
  
  // Express Winston error logging middleware (after routes, before error handlers)
  app.use(errorLogger);
  
  // Global error handler
  app.use((err, req, res, next) => {
    req.logger.error('Unhandled application error', { 
      error: { 
        message: err.message,
        stack: err.stack,
        name: err.name,
        code: err.code
      }
    });
    
    res.status(err.status || 500).json({
      error: {
        message: err.message || 'Internal Server Error',
        requestId: req.requestId
      }
    });
  });

  let PORT = process.env.PORT || 5000;
  let server;
  function tryListen(port, maxAttempts = 10) {
    let attempts = 0;
    function listen() {
      server = app.listen(port, '0.0.0.0', () => {
        logger.info(`Server started successfully`, {
          port,
          endpoints: {
            api: `http://0.0.0.0:${port}/api/executables`,
            download: `http://0.0.0.0:${port}/download`,
            docs: `http://0.0.0.0:${port}/api-docs`
          }
        });
      });
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempts < maxAttempts) {
          attempts++;
          port++;
          logger.warn(`Port ${port - 1} in use, trying port ${port}...`);
          listen();
        } else {
          logger.error('Failed to start server:', { error: err });
          process.exit(1);
        }
      });
    }
    listen();
  }
  if (process.env.NODE_ENV === 'development') {
    tryListen(Number(PORT));
  } else {
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server started successfully`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'production',
        endpoints: {
          api: `http://0.0.0.0:${PORT}/api/executables`,
          download: `http://0.0.0.0:${PORT}/download`,
          docs: `http://0.0.0.0:${PORT}/api-docs`
        }
      });
    });
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', { 
    error: { 
      message: error.message,
      stack: error.stack,
      name: error.name
    }
  });
  
  // Give logger time to write before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Rejection:', { 
    error: { 
      message: error ? error.message : 'Unknown error',
      stack: error ? error.stack : '',
      name: error ? error.name : 'UnknownError'
    }
  });
  
  // Give logger time to write before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

startServer().catch(error => {
  logger.error('Failed to start server:', { 
    error: { 
      message: error.message,
      stack: error.stack,
      name: error.name
    }
  });
  process.exit(1);
});