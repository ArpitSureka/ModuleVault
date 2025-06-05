const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const packageService = require('./packageService');
const { generateUniqueFileName, getFileSize, cleanupDirectory } = require('../utils/fileUtils');

class BuildService {
  constructor() {
    this.tempDir = path.join(__dirname, '..', 'temp');
    this.executablesDir = path.join(__dirname, '..', 'executables');
    
    // Ensure directories exist
    [this.tempDir, this.executablesDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async buildExecutable(packageInfo, os) {
    // Always use a flat, safe directory for npm packages (no @ or / in the name)
    const safeName = packageInfo.name.replace(/^@/, '').replace(/[\/]/g, '_');
    const buildId = `${safeName}_${packageInfo.version}_${os}_${Date.now()}`;
    const workDir = path.join(this.tempDir, buildId);
    
    try {
      console.log(`Building executable for ${packageInfo.name} (${os})`);
      
      // Create working directory
      fs.mkdirSync(workDir, { recursive: true });
      
      // Download package
      await packageService.downloadPackage(packageInfo, workDir);
      
      // Build executable based on repository manager and OS
      const executablePath = await this.createExecutable(packageInfo, workDir, os);
      
      // Generate unique filename and move to executables directory
      // Use a safe filename without @ and / for compatibility
      const safePackageName = packageInfo.name.replace(/[@\/]/g, '_');
      const fileName = generateUniqueFileName(
        `${safePackageName}_${packageInfo.version}_${os}`,
        this.getExecutableExtension(os)
      );
      
      const finalPath = path.join(this.executablesDir, fileName);
      fs.copyFileSync(executablePath, finalPath);
      
      const fileSize = getFileSize(finalPath);
      
      return {
        success: true,
        fileName,
        fileSize,
        path: finalPath
      };
      
    } catch (error) {
      console.error(`Build failed for ${packageInfo.name}:`, error);
      return {
        success: false,
        error: `Failed to build executable: ${error.message}`
      };
    } finally {
      // Cleanup working directory
      try {
        cleanupDirectory(workDir);
      } catch (cleanupError) {
        console.warn('Failed to cleanup build directory:', cleanupError.message);
      }
    }
  }

  async createExecutable(packageInfo, workDir, os) {
    if (packageInfo.repositoryManager === 'npm') {
      return await this.createNpmExecutable(packageInfo, workDir, os);
    } else if (packageInfo.repositoryManager === 'pip') {
      return await this.createPipExecutable(packageInfo, workDir, os);
    } else {
      throw new Error('Unsupported repository manager');
    }
  }

  async createNpmExecutable(packageInfo, workDir, os) {
    try {
      // Check if pkg is available for creating Node.js executables
      try {
        execSync('which pkg', { encoding: 'utf8' });
      } catch (error) {
        // Install pkg globally if not available
        console.log('Installing pkg for Node.js executable creation...');
        execSync('npm install -g pkg', { encoding: 'utf8', timeout: 120000 });
      }

      // Find the main entry point
      // Handle scoped packages (@scope/pkg) correctly
      console.log('Looking for package.json in node_modules');
      let packageJsonPath;
      
      // First check if it's available directly in node_modules
      if (fs.existsSync(path.join(workDir, 'node_modules', packageInfo.name, 'package.json'))) {
        packageJsonPath = path.join(workDir, 'node_modules', packageInfo.name, 'package.json');
        console.log(`Found package.json at ${packageJsonPath}`);
      }
      // Check common alternative locations
      else if (packageInfo.name.startsWith('@') && !fs.existsSync(packageJsonPath)) {
        // For scoped packages, try different path structures
        const packageNameParts = packageInfo.name.split('/');
        if (packageNameParts.length === 2) {
          const scope = packageNameParts[0].replace('@', '');
          const pkgName = packageNameParts[1];
          
          const possiblePaths = [
            path.join(workDir, 'node_modules', packageInfo.name, 'package.json'),
            path.join(workDir, 'node_modules', scope, pkgName, 'package.json'),
            path.join(workDir, 'node_modules', '@' + scope, pkgName, 'package.json')
          ];
          
          for (const possiblePath of possiblePaths) {
            console.log(`Checking for package.json at ${possiblePath}`);
            if (fs.existsSync(possiblePath)) {
              packageJsonPath = possiblePath;
              console.log(`Found package.json at ${packageJsonPath}`);
              break;
            }
          }
        }
      }
      
      let mainFile = 'index.js';
      
      if (packageJsonPath && fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        mainFile = packageJson.main || packageJson.bin || 'index.js';
        
        // Handle bin object
        if (typeof mainFile === 'object') {
          mainFile = Object.values(mainFile)[0] || 'index.js';
        }
      } else {
        console.log(`Could not find package.json for ${packageInfo.name}, using default index.js`);
      }

      // Create a wrapper script
      const wrapperScript = this.createNodeWrapper(packageInfo, mainFile);
      const wrapperPath = path.join(workDir, 'wrapper.js');
      fs.writeFileSync(wrapperPath, wrapperScript);

      // Build executable with pkg
      const target = this.getPkgTarget(os);
      // Use a safe output name without @ and / for compatibility
      const safePackageName = packageInfo.name.replace(/[@\/]/g, '_');
      const outputName = `${safePackageName}${this.getExecutableExtension(os)}`;
      const outputPath = path.join(workDir, outputName);

      execSync(`pkg ${wrapperPath} --target ${target} --output ${outputPath}`, {
        encoding: 'utf8',
        timeout: 300000,
        cwd: workDir
      });

      if (!fs.existsSync(outputPath)) {
        throw new Error('Executable was not created');
      }

      return outputPath;
    } catch (error) {
      console.error('NPM executable creation failed:', error);
      throw new Error(`Failed to create NPM executable: ${error.message}`);
    }
  }

  async createPipExecutable(packageInfo, workDir, os) {
    try {
      // Check if PyInstaller is available
      try {
        execSync('which pyinstaller', { encoding: 'utf8' });
      } catch (error) {
        // Install PyInstaller if not available
        console.log('Installing PyInstaller for Python executable creation...');
        execSync('pip install pyinstaller', { encoding: 'utf8', timeout: 120000 });
      }

      // Create a wrapper Python script
      const wrapperScript = this.createPythonWrapper(packageInfo);
      const wrapperPath = path.join(workDir, 'wrapper.py');
      fs.writeFileSync(wrapperPath, wrapperScript);

      // Build executable with PyInstaller
      const outputName = `${packageInfo.name}${this.getExecutableExtension(os)}`;
      const distPath = path.join(workDir, 'dist', 'wrapper');
      
      const pyinstallerCmd = [
        'pyinstaller',
        '--onefile',
        '--name', 'wrapper',
        '--distpath', path.join(workDir, 'dist'),
        '--workpath', path.join(workDir, 'build'),
        '--specpath', workDir,
        wrapperPath
      ].join(' ');

      execSync(pyinstallerCmd, {
        encoding: 'utf8',
        timeout: 300000,
        cwd: workDir,
        env: { ...process.env, PYTHONPATH: workDir }
      });

      const executablePath = distPath + this.getExecutableExtension(os);
      
      if (!fs.existsSync(executablePath)) {
        throw new Error('Executable was not created by PyInstaller');
      }

      return executablePath;
    } catch (error) {
      console.error('PIP executable creation failed:', error);
      throw new Error(`Failed to create PIP executable: ${error.message}`);
    }
  }

  createNodeWrapper(packageInfo, mainFile) {
    // Create a more robust wrapper that can handle scoped packages
    return `#!/usr/bin/env node

// Wrapper for ${packageInfo.name}@${packageInfo.version}
const path = require('path');
const fs = require('fs');

try {
  // Try multiple require strategies
  const modulePaths = [
    path.join(__dirname, 'node_modules', '${packageInfo.name}', '${mainFile}'),
    path.join(__dirname, 'node_modules', '${packageInfo.name.replace(/^@/, '').replace(/\//, '_')}', '${mainFile}')
  ];
  
  let loaded = false;
  
  // Try each module path
  for (const modulePath of modulePaths) {
    if (fs.existsSync(modulePath)) {
      console.log('Loading module from: ' + modulePath);
      require(modulePath);
      loaded = true;
      break;
    }
  }
  
  // If no specific paths worked, try direct require
  if (!loaded) {
    console.log('Trying direct require for ${packageInfo.name}');
    require('${packageInfo.name}');
  }
} catch (error) {
  console.error('Error running ${packageInfo.name}:', error.message);
  console.error('Available modules in node_modules:', fs.existsSync(path.join(__dirname, 'node_modules')) ? 
    fs.readdirSync(path.join(__dirname, 'node_modules')).join(', ') : 'none');
  process.exit(1);
}
`;
  }

  createPythonWrapper(packageInfo) {
    return `#!/usr/bin/env python3

# Wrapper for ${packageInfo.name}==${packageInfo.version}
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import ${packageInfo.name.replace('-', '_')}
    
    # Try to find and run main function or module
    if hasattr(${packageInfo.name.replace('-', '_')}, 'main'):
        ${packageInfo.name.replace('-', '_')}.main()
    elif hasattr(${packageInfo.name.replace('-', '_')}, '__main__'):
        exec(${packageInfo.name.replace('-', '_')}.__main__)
    else:
        print(f"${packageInfo.name} imported successfully")
        
except ImportError as e:
    print(f"Error importing ${packageInfo.name}: {e}")
    sys.exit(1)
except Exception as e:
    print(f"Error running ${packageInfo.name}: {e}")
    sys.exit(1)
`;
  }

  getPkgTarget(os) {
    switch (os.toLowerCase()) {
      case 'windows':
        return 'node18-win-x64';
      case 'macos':
        return 'node18-macos-x64';
      case 'linux':
        return 'node18-linux-x64';
      default:
        return 'node18-linux-x64';
    }
  }

  getExecutableExtension(os) {
    switch (os.toLowerCase()) {
      case 'windows':
        return '.exe';
      case 'macos':
      case 'linux':
        return '';
      default:
        return '';
    }
  }
}

module.exports = new BuildService();
