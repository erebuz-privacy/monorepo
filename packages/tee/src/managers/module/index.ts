// Module Manager - Exports Module class and related types
// ModuleManager manages all module definitions

import { logger } from '../log';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Module definition interface
 */
export interface Module {
  name: string;
  description: string;
  tokens: string[];
  chains: string[];
  features: string[];
  newFeatures?: Record<string, string>;
}

/**
 * Module config directory path
 */
const MODULE_CONFIG_DIR = join(process.cwd(), 'src/config/web3/modules');

/**
 * ModuleManager class to manage all module definitions
 */
class ModuleManager {
  private modules: Map<string, Module> = new Map(); // Module name -> Module instance

  constructor() {
    // Load all module configs from the config/web3/modules folder during initialization
    this.loadModuleConfigs().catch((error) => {
      logger.error('Failed to load module configs during initialization', 'ModuleManager', error);
    });
  }

  /**
   * Load all module configurations from the config/web3/modules folder
   * @private
   */
  private async loadModuleConfigs(): Promise<void> {
    try {
      // Check if config directory exists
      const files = await readdir(MODULE_CONFIG_DIR);
      
      // Filter for JSON files
      const jsonFiles = files.filter((file) => file.endsWith('.json'));

      // Load and register each module config
      for (const file of jsonFiles) {
        try {
          const filePath = join(MODULE_CONFIG_DIR, file);
          const fileContent = await readFile(filePath, 'utf-8');
          const module = JSON.parse(fileContent) as Module;
          
          this.registerModule(module);
        } catch (error) {
          logger.error(`Failed to load module config from ${file}`, 'ModuleManager', error);
        }
      }

      logger.info(`Loaded ${jsonFiles.length} module configuration(s)`, 'ModuleManager');
    } catch (error) {
      // Directory might not exist yet, which is okay
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to read module config directory', 'ModuleManager', error);
      }
    }
  }

  /**
   * Register a new module definition
   */
  registerModule(module: Module): Module {
    // Check if module with same name already exists
    if (this.modules.has(module.name)) {
      logger.warn(`Module ${module.name} is already registered`, 'ModuleManager');
      return this.modules.get(module.name)!;
    }

    this.modules.set(module.name, module);

    logger.info(`Registered module: ${module.name}`, 'ModuleManager');
    return module;
  }

  /**
   * Get all supported module names
   * @returns Array of all registered module names
   */
  getAllModules(): string[] {
    return Array.from(this.modules.keys());
  }

  /**
   * Get a module by name
   */
  getModule(name: string): Module | undefined {
    return this.modules.get(name);
  }

  /**
   * Check if a module is supported
   */
  hasModule(name: string): boolean {
    return this.modules.has(name);
  }
}

// Create and export singleton instance
export const moduleManager = new ModuleManager();

