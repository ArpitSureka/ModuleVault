// Swagger (OpenAPI) specification for ModuleVault 2 API
module.exports = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Executable Converter API',
      version: '1.0.0',
      description: 'REST API to convert npm and pip packages into OS-specific executables. Search, build, and download executables.',
    },
    servers: [
      {
        url: 'http://localhost:5000',
      },
    ],
  },
  apis: ['./routes/*.js'], // Path to the API docs in JSDoc format
};
