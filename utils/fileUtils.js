const fs = require('fs');
const path = require('path');

class FileUtils {
  generateUniqueFileName(baseName, extension = '') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${baseName}_${timestamp}_${random}${extension}`;
  }

  getFileSize(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch (error) {
      console.error('Error getting file size:', error);
      return 0;
    }
  }

  cleanupDirectory(dirPath) {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log(`Cleaned up directory: ${dirPath}`);
      }
    } catch (error) {
      console.error(`Failed to cleanup directory ${dirPath}:`, error);
      throw error;
    }
  }

  ensureDirectoryExists(dirPath) {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`Created directory: ${dirPath}`);
      }
    } catch (error) {
      console.error(`Failed to create directory ${dirPath}:`, error);
      throw error;
    }
  }

  isValidFileName(fileName) {
    // Check for valid filename (no path traversal, special characters)
    const invalidChars = /[<>:"/\\|?*]/;
    return !invalidChars.test(fileName) && fileName.length > 0 && fileName.length < 255;
  }

  sanitizeFileName(fileName) {
    // Remove or replace invalid characters
    return fileName
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .toLowerCase()
      .substring(0, 200); // Limit length
  }

  getFileExtension(fileName) {
    return path.extname(fileName).toLowerCase();
  }

  getMimeType(fileName) {
    const ext = this.getFileExtension(fileName);
    const mimeTypes = {
      '.exe': 'application/octet-stream',
      '.deb': 'application/octet-stream',
      '.rpm': 'application/octet-stream',
      '.dmg': 'application/octet-stream',
      '.app': 'application/octet-stream',
      '.bin': 'application/octet-stream'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }

  async fileExists(filePath) {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async createTempDirectory(prefix = 'temp') {
    const tempDir = path.join(__dirname, '..', 'temp');
    const uniqueDir = path.join(tempDir, `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
    
    await fs.promises.mkdir(uniqueDir, { recursive: true });
    return uniqueDir;
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = new FileUtils();
