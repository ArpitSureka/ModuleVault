import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import packageService from "./packageService.js";
import fileUtils from "../utils/fileUtils.js";

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
} from "fs";
import { join, resolve } from "path";
import { exec as execCb } from "child_process";
import { promisify } from "util";

const exec = promisify(execCb);

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class BuildService {
  constructor() {
    this.tempDir = path.join(__dirname, "..", "temp");
    this.executablesDir = path.join(__dirname, "..", "executables");

    // Ensure directories exist
    [this.tempDir, this.executablesDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async buildExecutable(packageInfo, os) {
    // Always use a flat, safe directory for npm packages (no @ or / in the name)
    const safeName = packageInfo.name.replace(/^@/, "").replace(/[\/]/g, "_");
    const buildId = `${safeName}_${packageInfo.version}_${os}_${Date.now()}`;
    const workDir = path.join(this.tempDir, buildId);

    try {
      console.log(`Building executable for ${packageInfo.name} (${os})`);

      // Create working directory
      fs.mkdirSync(workDir, { recursive: true });

      // Download package
      await packageService.downloadPackage(packageInfo, workDir);

      // Build executable based on repository manager and OS
      const executablePath = await this.createExecutable(
        packageInfo,
        workDir,
        os
      );

      // Generate unique filename and move to executables directory
      // Use a safe filename without @ and / for compatibility
      const safePackageName = packageInfo.name.replace(/[@\/]/g, "_");
      const fileName = fileUtils.generateUniqueFileName(
        `${safePackageName}_${packageInfo.version}_${os}`,
        this.getExecutableExtension(os)
      );

      const finalPath = path.join(this.executablesDir, fileName);
      fs.copyFileSync(executablePath, finalPath);

      const fileSize = fileUtils.getFileSize(finalPath);

      return {
        success: true,
        fileName,
        fileSize,
        path: finalPath,
      };
    } catch (error) {
      console.error(`Build failed for ${packageInfo.name}:`, error);
      return {
        success: false,
        error: `Failed to build executable: ${error.message}`,
      };
    } finally {
      // Cleanup working directory
      try {
        fileUtils.cleanupDirectory(workDir);
      } catch (cleanupError) {
        console.warn(
          "Failed to cleanup build directory:",
          cleanupError.message
        );
      }
    }
  }

  async createExecutable(packageInfo, workDir, os) {
    if (packageInfo.repositoryManager === "npm") {
      return await this.createNpmExecutable(packageInfo, workDir, os);
    } else if (packageInfo.repositoryManager === "pip") {
      return await this.createPipExecutable(packageInfo, workDir, os);
    } else {
      throw new Error("Unsupported repository manager");
    }
  }

  async executeCommand(command, options) {
    return new Promise((resolve, reject) => {
        exec(command, options, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing command: ${command}\n${stderr}`);
                reject(error);
                return;
            }
            resolve({ stdout, stderr });
        });
    });
  }

  async createNpmExecutable(packageInfo, workingDir, os) {
    // const tempDir = workingDir;
    const { name: moduleName, version } = packageInfo;
    if (!moduleName || !version) {
      throw new Error("Package information must include 'name' and 'version'.");
    }
    const buildDir = workingDir;
    const executableName = os === "win" ? `${moduleName}.exe` : moduleName;
    const executablePath = path.join(buildDir, executableName);

    try {
      // 1. Create the temporary build directory
      console.log(`Creating temporary build directory at: ${buildDir}`);
      fs.mkdirSync(buildDir, { recursive: true });

      // 2. Create package.json
      const packageJsonPath = path.join(buildDir, "package.json");
      const packageJsonContent = {
        name: `${moduleName}-executable`,
        version: "1.0.0",
        description: `Executable for ${moduleName}`,
        main: "index.js", // A dummy entry point
        dependencies: {
          [moduleName]: version,
        },
        scripts: {
          start: `node -e "require('${moduleName}')"`,
        },
      };

      console.log("Creating package.json...");
      fs.writeFileSync(
        packageJsonPath,
        JSON.stringify(packageJsonContent, null, 2)
      );

      // Create a dummy index.js for pkg to have an entry point if needed
      const entryFilePath = path.join(buildDir, "index.js");
      // We will later determine the actual entry point from the installed module
      fs.writeFileSync(entryFilePath, `// Dummy entry point`);

      // 3. Install the node module
      console.log(`Installing ${moduleName}@${version} and pkg...`);
      // We install 'pkg' locally to the build directory to ensure it's available.
      await this.executeCommand(`npm install pkg`, { cwd: buildDir });

      // 4. Determine the binary path from the installed module
      console.log("Determining module entry point...");
      const modulePath = path.join(buildDir, "node_modules", moduleName);
      const modulePackageJsonPath = path.join(modulePath, "package.json");
      const modulePackageJson = JSON.parse(
        fs.readFileSync(modulePackageJsonPath, "utf8")
      );

      let entryPoint;
      if (modulePackageJson.bin) {
        // If 'bin' field exists, use it. It can be a string or a map.
        // console.log(modulePackageJson.bin);
        // console.log(`Module ${modulePackageJson.bin} has a ${typeof modulePackageJson.bin} field.`);
        let binPath =
          typeof modulePackageJson.bin === "string"
            ? modulePackageJson.bin
            : modulePackageJson.bin[moduleName];
        if (!binPath) {
          binPath = Object.values(modulePackageJson.bin)[0];
        }
        if (!binPath) {
          throw new Error(
            `Module ${moduleName} does not have a valid 'bin' entry in package.json.`
          );
        }
        // console.log(`Using bin path: ${binPath}`);
        // console.log(`Module path: ${modulePath}`);
        entryPoint = path.join(modulePath, binPath);
      } else if (modulePackageJson.main) {
        // Otherwise, fall back to the 'main' field.
        entryPoint = path.join(modulePath, modulePackageJson.main);
      } else {
        throw new Error(
          `Could not determine the entry point for module: ${moduleName}. Neither 'bin' nor 'main' found in package.json.`
        );
      }

      console.log(`Module entry point identified: ${entryPoint}`);

      // 5. Build the executable using pkg
      const targetPlatform = `node16-${os}-x64`;
      const assets = [
        "node_modules/**/*",
      ].join(',');

      const pkgCommand = `npx pkg "${entryPoint}" --targets ${targetPlatform} --output "${executablePath}" --assets "${assets}"`;

      console.log(`Running pkg to build executable for ${os}...`);
      console.log(`Executing command: ${pkgCommand}`);
      const { stdout, stderr } = await this.executeCommand(pkgCommand, {
        cwd: buildDir,
      });

      if (stdout) console.log("pkg stdout:", stdout);
      if (stderr) console.warn("pkg stderr:", stderr);

      console.log(`\n✅ Executable created successfully!`);
      console.log(`✅ Path: ${executablePath}`);

      return executablePath;
    } catch (error) {
      console.error(`\n❌ An error occurred during the build process:`);
      console.error(error);
      throw error; // Re-throw the error for the caller to handle
    }
  }

  async createPipExecutable(packageInfo, workDir, os) {
    try {
      // Check if PyInstaller is available
      try {
        execSync("which pyinstaller", { encoding: "utf8" });
      } catch (error) {
        // Install PyInstaller if not available
        console.log("Installing PyInstaller for Python executable creation...");
        execSync("pip install pyinstaller", {
          encoding: "utf8",
          timeout: 120000,
        });
      }

      // Create a wrapper Python script
      const wrapperScript = this.createPythonWrapper(packageInfo);
      const wrapperPath = path.join(workDir, "wrapper.py");
      fs.writeFileSync(wrapperPath, wrapperScript);

      // Build executable with PyInstaller
      const outputName = `${packageInfo.name}${this.getExecutableExtension(
        os
      )}`;
      const distPath = path.join(workDir, "dist", "wrapper");

      const pyinstallerCmd = [
        "pyinstaller",
        "--onefile",
        "--name",
        "wrapper",
        "--distpath",
        path.join(workDir, "dist"),
        "--workpath",
        path.join(workDir, "build"),
        "--specpath",
        workDir,
        wrapperPath,
      ].join(" ");

      execSync(pyinstallerCmd, {
        encoding: "utf8",
        timeout: 300000,
        cwd: workDir,
        env: { ...process.env, PYTHONPATH: workDir },
      });

      const executablePath = distPath + this.getExecutableExtension(os);

      if (!fs.existsSync(executablePath)) {
        throw new Error("Executable was not created by PyInstaller");
      }

      return executablePath;
    } catch (error) {
      console.error("PIP executable creation failed:", error);
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
    path.join(__dirname, 'node_modules', '${packageInfo.name
      .replace(/^@/, "")
      .replace(/\//, "_")}', '${mainFile}')
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
    import ${packageInfo.name.replace("-", "_")}
    
    # Try to find and run main function or module
    if hasattr(${packageInfo.name.replace("-", "_")}, 'main'):
        ${packageInfo.name.replace("-", "_")}.main()
    elif hasattr(${packageInfo.name.replace("-", "_")}, '__main__'):
        exec(${packageInfo.name.replace("-", "_")}.__main__)
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
      case "windows":
        return "node18-win-x64";
      case "macos":
        return "node18-macos-x64";
      case "linux":
        return "node18-linux-x64";
      default:
        return "node18-linux-x64";
    }
  }

  getExecutableExtension(os) {
    switch (os.toLowerCase()) {
      case "windows":
        return ".exe";
      case "macos":
      case "linux":
        return "";
      default:
        return "";
    }
  }
}

const buildService = new BuildService();
export default buildService;
