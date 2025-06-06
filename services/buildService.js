import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import packageService from './packageService.js';
import fileUtils from '../utils/fileUtils.js';

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "fs";
import { join, resolve } from "path";
import { exec as execCb } from "child_process";
import { promisify } from "util";

const exec = promisify(execCb);

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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


  async createNpmExecutable(packageInfo, workingDir, os) {

    const { name: moduleName, version } = packageInfo;
    if (!moduleName || !version) {
      throw new Error("Package information must include 'name' and 'version'.");
    }
    // 1. Resolve and ensure workingDir exists
    const wd = resolve(workingDir);
    if (!existsSync(wd)) {
      mkdirSync(wd, { recursive: true });
    }

    // 2. Initialize npm project if package.json is missing
    const pkgJsonPath = join(wd, "package.json");
    if (!existsSync(pkgJsonPath)) {
      console.log(`Initializing new npm project in ${wd}...`);
      await exec(`npm init -y`, { cwd: wd });
    }

    // 3. Install the specified module@version
    console.log(`Installing ${moduleName}@${version}...`);
    await exec(`npm install ${moduleName}@${version}`, { cwd: wd });

    // 4. Read the installed module's package.json to find its "bin" entry
    const installedPkgJsonPath = join(wd, "node_modules", moduleName, "package.json");
    if (!existsSync(installedPkgJsonPath)) {
      throw new Error(`Could not find ${moduleName}@${version} in node_modules.`);
    }

    const installedPkgJson = JSON.parse(readFileSync(installedPkgJsonPath, "utf-8"));
    let binRelativePath;
    if (typeof installedPkgJson.bin === "string") {
      binRelativePath = installedPkgJson.bin;
    } else if (typeof installedPkgJson.bin === "object") {
      // Pick the first key's value
      const keys = Object.keys(installedPkgJson.bin);
      if (keys.length === 0) {
        throw new Error(`No "bin" entry found in ${moduleName}'s package.json.`);
      }
      binRelativePath = installedPkgJson.bin[keys[0]];
    } else {
      throw new Error(`The package "${moduleName}" has no "bin" field.`);
    }

    const entryFile = join(wd, "node_modules", moduleName, binRelativePath);
    if (!existsSync(entryFile)) {
      throw new Error(`Entry file for "${moduleName}" not found at ${entryFile}.`);
    }
    console.log(`Using entry point: ${entryFile}`);

    // 5. Create a dist directory
    const distDir = join(wd, "dist");
    if (!existsSync(distDir)) {
      mkdirSync(distDir);
    }

    // 6. Bundle with esbuild
    //    - Outputs a CommonJS bundle (remove "format=esm" for older packages).
    //    - Targets Node.js v20 for latest feature support.
    const bundledPath = join(distDir, "bundle.js");
    console.log(`Bundling with esbuild → ${bundledPath} ...`);
    await exec(
      `npx esbuild "${entryFile}" \
        --bundle \
        --platform=node \
        --target=node20 \
        --format=cjs \
        --outfile="${bundledPath}"`,
      { cwd: wd }
    );

    // 7. Prepend Node shebang and mark bundled JS executable
    const shebang = "#!/usr/bin/env node\n";
    const originalCode = readFileSync(bundledPath, "utf-8");
    writeFileSync(bundledPath, shebang + originalCode, "utf-8");
    chmodSync(bundledPath, 0o755);
    console.log(`Marked ${bundledPath} as executable.`);

    // 8. Determine nexe target string & output name
    let platformToken;
    let outputName = moduleName;
    if (os === "macos") {
      platformToken = "macos-x64-20.0.0";
      outputName = moduleName; // No extension on macOS
    } else if (os === "linux") {
      platformToken = "linux-x64-20.0.0";
      outputName = moduleName; // No extension on Linux
    } else if (os === "windows") {
      platformToken = "windows-x64-20.0.0";
      outputName = `${moduleName}.exe`;
    } else {
      throw new Error(`Unsupported OS: ${os}. Choose "macos", "linux", or "windows".`);
    }

    const nativeOutput = join(distDir, outputName);
    console.log(`Bundling into native executable for ${os} → ${nativeOutput} ...`);

    // 9. Run nexe to produce the final binary
    await exec(
      `npx nexe "${bundledPath}" \
        --target ${platformToken} \
        --output "${nativeOutput}"`,
      { cwd: wd }
    );

    // 10. Mark the final binary executable (chmod +x) on Unix if needed
    if (os === "macos" || os === "linux") {
      chmodSync(nativeOutput, 0o755);
    }

    console.log(`✅ Native executable created: ${nativeOutput}`);
    return nativeOutput;
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

const buildService = new BuildService();
export default buildService;
