import getExecutableModel from '../models/Executable.js';
import packageService from '../services/packageService.js';
import buildService from '../services/buildService.js';
import { createReadStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const resolvers = {
  Query: {
    searchExecutables: async (_, { query, page, limit, repositoryManager }) => {
      try {
        const Executable = getExecutableModel();
        const offset = (page - 1) * limit;
        const filter = {};
        if (query) {
          filter.$or = [
            { name: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } },
            { tags: query }
          ];
        }
        if (repositoryManager) {
          filter.repositoryManager = repositoryManager;
        }
        const total = await Executable.countDocuments(filter);
        const executables = await Executable.find(filter)
          .sort({ downloads: -1, createdAt: -1 })
          .skip(offset)
          .limit(limit);
        return {
          executables,
          total,
          page,
          limit
        };
      } catch (error) {
        console.error('Search error:', error);
        throw new Error('Failed to search executables');
      }
    },
    getExecutable: async (_, { id }) => {
      try {
        const Executable = getExecutableModel();
        const executable = await Executable.findById(id);
        if (!executable) {
          throw new Error('Executable not found');
        }
        return executable;
      } catch (error) {
        console.error('Get executable error:', error);
        throw new Error('Failed to get executable');
      }
    }
  },
  Mutation: {
    downloadExecutable: async (_, { name, repositoryManager, os, version }) => {
      try {
        const Executable = getExecutableModel();
        const searchCriteria = { name, repositoryManager };
        if (version) searchCriteria.version = version;
        let executable = await Executable.findOne(searchCriteria);
        if (executable) {
          const filePath = path.join(__dirname, '..', 'executables', executable.fileName);
          const fs = require('fs');
          if (fs.existsSync(filePath)) {
            executable.downloads += 1;
            await executable.save();
            return {
              success: true,
              message: 'Executable ready for download',
              downloadUrl: `/download/${executable.fileName}`,
              executable
            };
          }
        }
        const packageInfo = await packageService.getPackageInfo(name, repositoryManager, version);
        if (!packageInfo) {
          return {
            success: false,
            message: `Package '${name}' not found in ${repositoryManager} registry`,
            downloadUrl: null,
            executable: null
          };
        }
        const buildResult = await buildService.buildExecutable(packageInfo, os);
        if (!buildResult.success) {
          return {
            success: false,
            message: buildResult.error || 'Failed to build executable',
            downloadUrl: null,
            executable: null
          };
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
        return {
          success: true,
          message: 'Executable built and ready for download',
          downloadUrl: `/download/${buildResult.fileName}`,
          executable
        };
      } catch (error) {
        console.error('Download error:', error);
        return {
          success: false,
          message: error.message || 'Internal server error occurred while processing your request',
          downloadUrl: null,
          executable: null
        };
      }
    }
  }
};

export default resolvers;
