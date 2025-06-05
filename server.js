require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const { connectDB } = require('./config/database');
const executableRoutes = require('./routes/executables');
const swaggerOptions = require('./swagger');

async function startServer() {
  const app = express();

  // Connect to MongoDB
  await connectDB();

  // Create executables directory if it doesn't exist
  const executablesDir = path.join(__dirname, 'executables');
  if (!fs.existsSync(executablesDir)) {
    fs.mkdirSync(executablesDir, { recursive: true });
  }

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Serve static executable files
  app.use('/download', express.static(executablesDir));

  // API Routes
  app.use('/api/executables', executableRoutes);

  // Swagger setup
  const swaggerSpec = swaggerJsdoc(swaggerOptions);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
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
  });

  let PORT = process.env.PORT || 5000;
  let server;
  function tryListen(port, maxAttempts = 10) {
    let attempts = 0;
    function listen() {
      server = app.listen(port, '0.0.0.0', () => {
        console.log(`Server ready at http://0.0.0.0:${port}`);
        console.log(`API endpoints at http://0.0.0.0:${port}/api/executables`);
        console.log(`Executables served at http://0.0.0.0:${port}/download`);
        console.log(`Executables served at http://0.0.0.0:${port}/api-docs`);
      });
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempts < maxAttempts) {
          attempts++;
          port++;
          console.warn(`Port ${port - 1} in use, trying port ${port}...`);
          listen();
        } else {
          console.error('Failed to start server:', err);
          process.exit(1);
        }
      });
    }
    listen();
  }
  if (process.env.NODE_ENV === 'local') {
    tryListen(Number(PORT));
  } else {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server ready at http://0.0.0.0:${PORT}`);
      console.log(`API endpoints at http://0.0.0.0:${PORT}/api/executables`);
      console.log(`Executables served at http://0.0.0.0:${PORT}/download`);
      console.log(`Executables served at http://0.0.0.0:${PORT}/api-docs`);
    });
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
  process.exit(1);
});

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});