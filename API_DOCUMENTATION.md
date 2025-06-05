# Executable Converter REST API Documentation

## Base URL
```
http://localhost:5000
```

## Overview
This REST API converts npm and pip packages into OS-specific executables. It provides endpoints to search for existing executables and request new builds.

## Database Model - Executable
```json
{
  "id": "integer (auto-increment primary key)",
  "name": "string (package name)",
  "description": "string (package description)", 
  "tags": "array of strings (keywords/tags)",
  "downloads": "integer (download count, default: 0)",
  "score": "float (0-5, optional)",
  "version": "string (package version)",
  "securityRating": "float (0-10, optional)",
  "repositoryManager": "enum ('npm' or 'pip')",
  "fileName": "string (generated executable filename)",
  "fileSize": "integer (file size in bytes)",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

---

## API Endpoints

### 1. Health Check
**GET** `/health`

Check if the server is running.

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

---

### 2. API Information
**GET** `/`

Get API documentation and available endpoints.

**Response:**
```json
{
  "message": "Executable Converter API",
  "version": "1.0.0",
  "endpoints": {
    "health": "GET /health",
    "search": "GET /api/executables/search?query=<search_term>&page=<page>&limit=<limit>&repositoryManager=<npm|pip>",
    "getExecutable": "GET /api/executables/:id",
    "downloadExecutable": "POST /api/executables/download",
    "listExecutables": "GET /api/executables"
  },
  "downloadEndpoint": "/download/<filename>"
}
```

---

### 3. List All Executables
**GET** `/api/executables`

Get a paginated list of all available executables, sorted by download count (descending).

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

**Example Request:**
```bash
curl "http://localhost:5000/api/executables?page=1&limit=5"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "executables": [
      {
        "id": 1,
        "name": "lodash",
        "description": "A utility library",
        "tags": ["utility", "lodash", "javascript"],
        "downloads": 42,
        "score": null,
        "version": "4.17.21",
        "securityRating": null,
        "repositoryManager": "npm",
        "fileName": "lodash_4.17.21_linux_1234567890_abc123",
        "fileSize": 2048576,
        "createdAt": "2024-01-01T12:00:00.000Z",
        "updatedAt": "2024-01-01T12:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 15,
      "page": 1,
      "limit": 5,
      "totalPages": 3
    }
  }
}
```

---

### 4. Search Executables
**GET** `/api/executables/search`

Search for executables by name, description, or tags.

**Query Parameters:**
- `query` (optional): Search term to match against name, description, or tags
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `repositoryManager` (optional): Filter by repository manager ("npm" or "pip")

**Example Requests:**
```bash
# Search for packages containing "express"
curl "http://localhost:5000/api/executables/search?query=express"

# Search npm packages only
curl "http://localhost:5000/api/executables/search?repositoryManager=npm&page=1&limit=5"

# Search with multiple filters
curl "http://localhost:5000/api/executables/search?query=web&repositoryManager=npm&page=1&limit=10"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "executables": [
      {
        "id": 2,
        "name": "express",
        "description": "Fast, unopinionated, minimalist web framework",
        "tags": ["web", "framework", "express"],
        "downloads": 128,
        "score": null,
        "version": "4.18.2",
        "securityRating": null,
        "repositoryManager": "npm",
        "fileName": "express_4.18.2_windows_1234567890_def456.exe",
        "fileSize": 4096000,
        "createdAt": "2024-01-01T12:00:00.000Z",
        "updatedAt": "2024-01-01T12:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 3,
      "page": 1,
      "limit": 10,
      "totalPages": 1
    }
  }
}
```

---

### 5. Get Specific Executable
**GET** `/api/executables/:id`

Get details of a specific executable by ID.

**Example Request:**
```bash
curl "http://localhost:5000/api/executables/1"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "lodash",
    "description": "A utility library",
    "tags": ["utility", "lodash", "javascript"],
    "downloads": 42,
    "score": null,
    "version": "4.17.21",
    "securityRating": null,
    "repositoryManager": "npm",
    "fileName": "lodash_4.17.21_linux_1234567890_abc123",
    "fileSize": 2048576,
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-01T12:00:00.000Z"
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "message": "Executable not found"
}
```

---

### 6. Download/Build Executable
**POST** `/api/executables/download`

Request to download an existing executable or build a new one if it doesn't exist.

**Request Body:**
```json
{
  "name": "string (required) - Package name",
  "repositoryManager": "string (required) - 'npm' or 'pip'",
  "os": "string (required) - 'windows', 'macos', or 'linux'",
  "version": "string (optional) - Specific version, defaults to 'latest'"
}
```

**Example Requests:**
```bash
# Download/build latest version of lodash for Linux
curl -X POST "http://localhost:5000/api/executables/download" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "lodash",
    "repositoryManager": "npm",
    "os": "linux"
  }'

# Build specific version for Windows
curl -X POST "http://localhost:5000/api/executables/download" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "express",
    "repositoryManager": "npm",
    "os": "windows",
    "version": "4.18.2"
  }'

# Build Python package for macOS
curl -X POST "http://localhost:5000/api/executables/download" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "requests",
    "repositoryManager": "pip",
    "os": "macos"
  }'
```

**Success Response (200 - Existing executable):**
```json
{
  "success": true,
  "message": "Executable ready for download",
  "data": {
    "downloadUrl": "/download/lodash_4.17.21_linux_1234567890_abc123",
    "executable": {
      "id": 1,
      "name": "lodash",
      "description": "A utility library",
      "tags": ["utility", "lodash", "javascript"],
      "downloads": 43,
      "score": null,
      "version": "4.17.21",
      "securityRating": null,
      "repositoryManager": "npm",
      "fileName": "lodash_4.17.21_linux_1234567890_abc123",
      "fileSize": 2048576,
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:30:00.000Z"
    }
  }
}
```

**Success Response (201 - New executable built):**
```json
{
  "success": true,
  "message": "Executable built and ready for download",
  "data": {
    "downloadUrl": "/download/express_4.18.2_windows_1234567890_def456.exe",
    "executable": {
      "id": 2,
      "name": "express",
      "description": "Fast, unopinionated, minimalist web framework",
      "tags": ["web", "framework", "express"],
      "downloads": 1,
      "score": null,
      "version": "4.18.2",
      "securityRating": null,
      "repositoryManager": "npm",
      "fileName": "express_4.18.2_windows_1234567890_def456.exe",
      "fileSize": 4096000,
      "createdAt": "2024-01-01T13:00:00.000Z",
      "updatedAt": "2024-01-01T13:00:00.000Z"
    }
  }
}
```

**Error Responses:**

**400 Bad Request - Missing fields:**
```json
{
  "success": false,
  "message": "Missing required fields: name, repositoryManager, and os are required"
}
```

**400 Bad Request - Invalid repository manager:**
```json
{
  "success": false,
  "message": "Invalid repositoryManager. Must be \"npm\" or \"pip\""
}
```

**400 Bad Request - Invalid OS:**
```json
{
  "success": false,
  "message": "Invalid os. Must be \"windows\", \"macos\", or \"linux\""
}
```

**404 Not Found - Package not found:**
```json
{
  "success": false,
  "message": "Package 'nonexistent-package' not found in npm registry"
}
```

**500 Internal Server Error - Build failure:**
```json
{
  "success": false,
  "message": "Failed to build executable: Build process encountered an error"
}
```

---

### 7. Download Executable File
**GET** `/download/:filename`

Download the actual executable file.

**Example Request:**
```bash
# Download the file directly
curl -O "http://localhost:5000/download/lodash_4.17.21_linux_1234567890_abc123"

# Or use wget
wget "http://localhost:5000/download/express_4.18.2_windows_1234567890_def456.exe"
```

**Response:**
- Returns the binary executable file
- Content-Type: application/octet-stream
- File is served directly for download

---

## Usage Workflow

### Typical Usage Pattern:

1. **Search for existing executables:**
   ```bash
   curl "http://localhost:5000/api/executables/search?query=express&repositoryManager=npm"
   ```

2. **If found, download directly using the downloadUrl from search results**

3. **If not found, request build:**
   ```bash
   curl -X POST "http://localhost:5000/api/executables/download" \
     -H "Content-Type: application/json" \
     -d '{"name": "express", "repositoryManager": "npm", "os": "linux"}'
   ```

4. **Download the executable file:**
   ```bash
   curl -O "http://localhost:5000/download/[filename_from_response]"
   ```

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Optional detailed error message"
}
```

Common HTTP status codes:
- `200` - Success (existing resource)
- `201` - Created (new resource)
- `400` - Bad Request (validation errors)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error (server-side issues)

---

## Rate Limiting

Currently, there are no rate limits implemented. Consider implementing rate limiting for production use.

---

## Notes

- Executables are built on-demand and cached for future requests
- The build process may take several minutes for complex packages
- File downloads are served statically from the `/download` endpoint
- The download counter increments each time an executable is requested (not downloaded)
- All timestamps are in ISO 8601 format (UTC)