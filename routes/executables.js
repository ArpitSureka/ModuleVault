const express = require('express');
const router = express.Router();
const getExecutableModel = require('../models/Executable');
const packageService = require('../services/packageService');
const buildService = require('../services/buildService');
const path = require('path');
const fs = require('fs');

/**
 * @swagger
 * tags:
 *   name: Executables
 *   description: API for managing and building executables
 */

/**
 * @swagger
 * /api/executables:
 *   get:
 *     summary: List all executables
 *     tags: [Executables]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of executables
 */

/**
 * @swagger
 * /api/executables/search:
 *   get:
 *     summary: Search executables
 *     tags: [Executables]
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Search term
 *       - in: query
 *         name: repositoryManager
 *         schema:
 *           type: string
 *           enum: [npm, pip]
 *         description: Filter by repository manager
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Search results
 */

/**
 * @swagger
 * /api/executables/{id}:
 *   get:
 *     summary: Get specific executable
 *     tags: [Executables]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Executable ID
 *     responses:
 *       200:
 *         description: Executable details
 *       404:
 *         description: Executable not found
 */

/**
 * @swagger
 * /api/executables/download:
 *   post:
 *     summary: Download/build executable
 *     tags: [Executables]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - repositoryManager
 *               - os
 *             properties:
 *               name:
 *                 type: string
 *               repositoryManager:
 *                 type: string
 *                 enum: [npm, pip]
 *               os:
 *                 type: string
 *                 enum: [windows, macos, linux]
 *               version:
 *                 type: string
 *     responses:
 *       200:
 *         description: Executable ready for download
 *       201:
 *         description: Executable built and ready for download
 *       400:
 *         description: Bad request
 *       404:
 *         description: Package not found
 *       500:
 *         description: Build failure
 */

// GET /api/executables - List all executables with pagination
router.get('/', async (req, res) => {
  try {
    const Executable = getExecutableModel();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const total = await Executable.countDocuments();
    const executables = await Executable.find()
      .sort({ downloads: -1, createdAt: -1 })
      .skip(offset)
      .limit(limit);

    res.json({
      success: true,
      data: {
        executables,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('List executables error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve executables',
      error: error.message
    });
  }
});

// GET /api/executables/search - Search executables
router.get('/search', async (req, res) => {
  try {
    const Executable = getExecutableModel();
    const { query, page = 1, limit = 10, repositoryManager } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let filter = {};
    if (query) {
      filter.$or = [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { tags: query }
      ];
    }
    if (repositoryManager && ['npm', 'pip'].includes(repositoryManager)) {
      filter.repositoryManager = repositoryManager;
    }
    const total = await Executable.countDocuments(filter);
    const executables = await Executable.find(filter)
      .sort({ downloads: -1, createdAt: -1 })
      .skip(offset)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: {
        executables,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search executables',
      error: error.message
    });
  }
});

// GET /api/executables/:id - Get specific executable
router.get('/:id', async (req, res) => {
  try {
    const Executable = getExecutableModel();
    const executable = await Executable.findById(req.params.id);
    if (!executable) {
      return res.status(404).json({
        success: false,
        message: 'Executable not found'
      });
    }
    res.json({
      success: true,
      data: executable
    });
  } catch (error) {
    console.error('Get executable error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get executable',
      error: error.message
    });
  }
});

// POST /api/executables/download - Download/build executable
router.post('/download', async (req, res) => {
  try {
    const Executable = getExecutableModel();
    const { name, repositoryManager, os, version } = req.body;
    if (!name || !repositoryManager || !os) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, repositoryManager, and os are required'
      });
    }
    if (!['npm', 'pip'].includes(repositoryManager)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid repositoryManager. Must be "npm" or "pip"'
      });
    }
    if (!['windows', 'macos', 'linux'].includes(os)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid os. Must be "windows", "macos", or "linux"'
      });
    }
    console.log(`Processing download request: ${name} (${repositoryManager}) for ${os}`);
    const searchCriteria = { name, repositoryManager };
    if (version) searchCriteria.version = version;
    let executable = await Executable.findOne(searchCriteria);
    if (executable) {
      const filePath = path.join(__dirname, '..', 'executables', executable.fileName);
      if (fs.existsSync(filePath)) {
        executable.downloads += 1;
        await executable.save();
        return res.json({
          success: true,
          message: 'Executable ready for download',
          data: {
            downloadUrl: `/download/${executable.fileName}`,
            executable
          }
        });
      } else {
        console.log('Executable record exists but file missing, rebuilding...');
      }
    }
    const packageInfo = await packageService.getPackageInfo(name, repositoryManager, version);
    if (!packageInfo) {
      return res.status(404).json({
        success: false,
        message: `Package '${name}' not found in ${repositoryManager} registry`
      });
    }
    const buildResult = await buildService.buildExecutable(packageInfo, os);
    if (!buildResult.success) {
      return res.status(500).json({
        success: false,
        message: buildResult.error || 'Failed to build executable'
      });
    }
    const executableData = {
      name: packageInfo.name,
      description: packageInfo.description || 'No description available',
      tags: packageInfo.keywords || [],
      version: packageInfo.version,
      repositoryManager,
      fileName: buildResult.fileName,
      fileSize: buildResult.fileSize,
      downloads: executable ? executable.downloads + 1 : 1
    };
    if (executable) {
      await Executable.updateOne({ _id: executable._id }, executableData);
      executable = await Executable.findById(executable._id);
    } else {
      executable = await Executable.create(executableData);
    }
    res.status(201).json({
      success: true,
      message: 'Executable built and ready for download',
      data: {
        downloadUrl: `/download/${buildResult.fileName}`,
        executable
      }
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error occurred while processing your request'
    });
  }
});

module.exports = router;