import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

class PackageService {
  async getPackageInfo(name, repositoryManager, version = 'latest') {
    try {
      let packageInfo;
      
      if (repositoryManager === 'npm') {
        packageInfo = await this.getNpmPackageInfo(name, version);
      } else if (repositoryManager === 'pip') {
        packageInfo = await this.getPipPackageInfo(name, version);
      } else {
        throw new Error('Unsupported repository manager');
      }
      
      return packageInfo;
    } catch (error) {
      console.error(`Failed to get package info for ${name}:`, error.message);
      return null;
    }
  }

  async getNpmPackageInfo(name, version) {
    try {
      const versionSpec = version === 'latest' ? name : `${name}@${version}`;
      const result = execSync(`npm view ${versionSpec} --json`, {
        encoding: 'utf8',
        timeout: 30000
      });
      
      const packageData = JSON.parse(result);
      
      return {
        name: packageData.name,
        version: packageData.version,
        description: packageData.description || 'No description available',
        keywords: packageData.keywords || [],
        repositoryManager: 'npm'
      };
    } catch (error) {
      console.error(`NPM package info error for ${name}:`, error.message);
      throw new Error(`Failed to fetch NPM package information: ${error.message}`);
    }
  }

  async getPipPackageInfo(name, version) {
    try {
      // Use uv pip show for installed packages or try to get info from PyPI
      let packageData;
      
      try {
        // Try to get info using uv pip show (if package is installed)
        const result = execSync(`uv pip show ${name}`, {
          encoding: 'utf8',
          timeout: 30000
        });
        
        packageData = this.parsePipShowOutput(result);
      } catch (showError) {
        // If uv pip show fails, try to install and get info
        console.log(`Package ${name} not installed, attempting to fetch from PyPI...`);
        
        // Create a temporary directory for installation
        const tempDir = path.join(__dirname, '..', 'temp', `pip_${Date.now()}`);
        fs.mkdirSync(tempDir, { recursive: true });
        
        // Create a virtual environment using uv
        const venvDir = path.join(tempDir, 'venv');
        
        try {
          // Create virtual environment
          execSync(`uv venv ${venvDir}`, {
            encoding: 'utf8',
            timeout: 30000
          });
          
          // Build the activation command
          const activateCmd = process.platform === 'win32' 
            ? `${path.join(venvDir, 'Scripts', 'activate.bat')} &&` 
            : `. ${path.join(venvDir, 'bin', 'activate')} &&`;
          
          const versionSpec = version === 'latest' ? name : `${name}==${version}`;
          
          // Install package in the virtual environment
          execSync(`${activateCmd} uv pip install ${versionSpec} --no-deps`, {
            encoding: 'utf8',
            timeout: 60000,
            shell: true
          });
          
          // Show package info
          const result = execSync(`${activateCmd} uv pip show ${name}`, {
            encoding: 'utf8',
            timeout: 30000,
            shell: true
          });
          
          packageData = this.parsePipShowOutput(result);
        } finally {
          // Clean up temp directory
          try {
            fs.rmSync(tempDir, { recursive: true, force: true });
          } catch (cleanupError) {
            console.warn('Failed to cleanup temp directory:', cleanupError.message);
          }
        }
      }
      
      return {
        name: packageData.name,
        version: packageData.version,
        description: packageData.summary || 'No description available',
        keywords: packageData.keywords || [],
        repositoryManager: 'pip'
      };
    } catch (error) {
      console.error(`PIP package info error for ${name}:`, error.message);
      throw new Error(`Failed to fetch PIP package information: ${error.message}`);
    }
  }

  parsePipShowOutput(output) {
    const lines = output.split('\n');
    const packageData = {};
    
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim().toLowerCase();
        const value = line.substring(colonIndex + 1).trim();
        
        switch (key) {
          case 'name':
            packageData.name = value;
            break;
          case 'version':
            packageData.version = value;
            break;
          case 'summary':
            packageData.summary = value;
            break;
          case 'keywords':
            packageData.keywords = value ? value.split(',').map(k => k.trim()) : [];
            break;
        }
      }
    }
    
    return packageData;
  }

  async downloadPackage(packageInfo, targetDir) {
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      if (packageInfo.repositoryManager === 'npm') {
        await this.downloadNpmPackage(packageInfo, targetDir);
      } else if (packageInfo.repositoryManager === 'pip') {
        await this.downloadPipPackage(packageInfo, targetDir);
      }
      
      return true;
    } catch (error) {
      console.error('Download package error:', error);
      throw error;
    }
  }

  async downloadNpmPackage(packageInfo, targetDir) {
    // Always use a flat directory for npm install (no @ or / in the name)
    // If the package name is scoped (e.g., @scope/pkg), use only the last part for the directory
    const safeDirName = packageInfo.name.replace(/^@/, '').replace(/[\/]/g, '_');
    const flatTargetDir = path.join(path.dirname(targetDir), `${safeDirName}_${Date.now()}`);
    if (fs.existsSync(flatTargetDir)) {
      fs.rmSync(flatTargetDir, { recursive: true, force: true });
    }
    fs.mkdirSync(flatTargetDir, { recursive: true });
    // Create an empty package.json if it does not exist
    const packageJsonPath = path.join(flatTargetDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      fs.writeFileSync(packageJsonPath, JSON.stringify({ name: "temp-npm-install", version: "1.0.0" }, null, 2));
    }
    const packageSpec = `${packageInfo.name}@${packageInfo.version}`;
    execSync(`npm install ${packageSpec} --prefix ${flatTargetDir} --production`, {
      encoding: 'utf8',
      timeout: 120000,
      cwd: flatTargetDir
    });
    // Copy installed node_modules to the original targetDir
    const srcNodeModules = path.join(flatTargetDir, 'node_modules');
    const destNodeModules = path.join(targetDir, 'node_modules');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    if (fs.existsSync(srcNodeModules)) {
      fs.cpSync(srcNodeModules, destNodeModules, { recursive: true });
    }
    // Clean up the flat temp dir
    fs.rmSync(flatTargetDir, { recursive: true, force: true });
  }

  async downloadPipPackage(packageInfo, targetDir) {
    const packageSpec = `${packageInfo.name}==${packageInfo.version}`;
    
    // Create a virtual environment in the target directory
    const venvDir = path.join(targetDir, 'venv');
    
    // Create the virtual environment using uv
    execSync(`uv venv ${venvDir}`, {
      encoding: 'utf8',
      timeout: 30000
    });
    
    // Build the activation command based on platform
    const activateCmd = process.platform === 'win32' 
      ? `${path.join(venvDir, 'Scripts', 'activate.bat')} &&` 
      : `. ${path.join(venvDir, 'bin', 'activate')} &&`;
    
    // Install the package in the virtual environment
    execSync(`${activateCmd} uv pip install ${packageSpec} --no-deps`, {
      encoding: 'utf8',
      timeout: 120000,
      shell: true
    });
  }
}

export default new PackageService();
