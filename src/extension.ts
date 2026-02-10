/*
 * Software Name : VSCode CRC: central-remote-config
 * SPDX-FileCopyrightText: Copyright (c) FX Soubirou - Orange SA
 * SPDX-License-Identifier: MIT
 *
 * This software is distributed under the MIT License,
 * see the "LICENSE.txt" file for more details or https://spdx.org/licenses/MIT.html
 *
 * Authors: Oumlala Omar - Orange SA; Soubirou FX - Orange SA
 * Software description: An extension to set the configuration of
 * the Continue extension from a remote server.
 */
import * as vscode from "vscode";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { StatusBarManager } from "./statusbar";

/**
 * Interval configuration
 * @constant {number} CHECK_INTERVAL_MS - Check interval in milliseconds (30 minutes)
 */
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes in millisecondes
const HTTP_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Extension command IDs
 * @namespace
 * @property {string} STATUS_BAR_CLICK - Status bar click command
 * @property {string} LOAD - Extension load command
 */
const COMMANDS = {
  STATUS_BAR_CLICK: "crcExtension.statusBarClick",
  LOAD: "central-remote-config.load",
};

/**
 * Quick Pick menu options
 * @namespace
 * @property {string} EDIT_SETTINGS - Settings edition option
 * @property {string} DOWNLOAD_CONFIG - Configuration download option
 */
const QUICK_PICK_OPTIONS = {
  EDIT_SETTINGS: "Edit settings",
  DOWNLOAD_CONFIG: "Download remote configuration",
};

/**
 * Directories used by the extension
 * @namespace
 * @property {string} CONTINUE - Continue directory
 */
const DIRS = {
  CONTINUE: ".continue",
} as const;

/**
 * File names used by the extension
 * @namespace
 * @property {string} CONFIG - Main configuration file
 * @property {string} CONFIG_TMP - Temporary file
 * @property {string} DEFAULT - Default configuration file
 */
const FILES = {
  CONFIG: "config.yaml",
  CONFIG_TMP: "config.yaml.tmp",
  DEFAULT: "default.yaml",
} as const;

/**
 * Extension messages
 * @namespace
 * @property {string} ACTIVATION - Activation message
 * @property {string} LOAD - Load message
 * @property {string} DOWNLOAD_SUCCESS - Download success message
 * @property {Function} DOWNLOAD_ERROR - Download error message generator
 * @property {Function} CONFIG_ERROR - Configuration error message generator
 */
const MESSAGES = {
  ACTIVATION: 'Extension "central-remote-config" is now active!',
  LOAD: "CRC: central-remote-config extension loaded!",
  DOWNLOAD_SUCCESS: "Remote configuration downloaded successfully!",
  DOWNLOAD_ERROR: (error: string) => `Error during download: ${error}`,
  CONFIG_ERROR: (key: string) =>
    `${key} is not defined, please update "Edit settings".`,
};

let checkInterval: NodeJS.Timeout | undefined;
// Status Bar Manager instance
let statusBarManager: StatusBarManager;

enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARNING = "WARNING",
  ERROR = "ERROR",
}

class Logger {
  private static readonly PREFIX = "[CRC]";

  static log(level: LogLevel, message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = `${timestamp} ${Logger.PREFIX} [${level}] ${message}`;

    switch (level) {
      case LogLevel.ERROR:
        console.error(formattedMessage, ...args);
        break;
      case LogLevel.WARNING:
        console.warn(formattedMessage, ...args);
        break;
      default:
        console.log(formattedMessage, ...args);
    }
  }

  static debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  static info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  static warning(message: string, ...args: any[]): void {
    this.log(LogLevel.WARNING, message, ...args);
  }

  static error(message: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }
}

/**
 * Manages file paths for the extension
 */
class PathManager {
  private readonly continueDirectoryPath: string;

  constructor(userDirectory: string) {
    this.continueDirectoryPath = path.join(userDirectory, DIRS.CONTINUE);
  }
  get directoryPath(): string {
    return this.continueDirectoryPath;
  }
  get configPath(): string {
    return path.join(this.continueDirectoryPath, FILES.CONFIG);
  }
  get tmpPath(): string {
    return path.join(this.continueDirectoryPath, FILES.CONFIG_TMP);
  }
  get defaultPath(): string {
    return path.join(this.continueDirectoryPath, FILES.DEFAULT);
  }
  async ensureDirectoryExists(): Promise<void> {
    await ensureDirectoryExists(this.continueDirectoryPath);
  }
}

/**
 * Detects if running in WSL environment with multiple detection methods
 * @returns {boolean} True if running in WSL
 */
function isWSLEnvironment(): boolean {
  // 1 : VSCode remote
  if (vscode.env.remoteName === "wsl") {
    Logger.debug("WSL detected by VSCode remote name");
    return true;
  }

  // 2 : Env. variables WSL
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
    Logger.debug("WSL detected by environment variables");
    return true;
  }

  // 3 : Check /proc/version (for WSL1 and WSL2)
  if (process.platform === "linux") {
    try {
      const procVersion = fs.readFileSync("/proc/version", "utf8").toLowerCase();
      if (procVersion.includes("microsoft") || procVersion.includes("wsl")) {
        Logger.debug("WSL detected with /proc/version");
        return true;
      }
    } catch (error) {
      Logger.debug(`Could not read /proc/version: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  Logger.debug("Not running in WSL environment");
  return false;
}

async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.promises.access(dirPath);
    Logger.debug(`Directory exists: ${dirPath}`);
  } catch {
    Logger.info(`Creating directory: ${dirPath}`);
    await fs.promises.mkdir(dirPath, { recursive: true });
  }
}

/**
 * Validates that a path is accessible
 * @param {string} dirPath - Path to validate
 * @returns {Promise<boolean>} True if path is accessible
 */
async function isPathAccessible(dirPath: string): Promise<boolean> {
  try {
    await fs.promises.access(dirPath, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Activates the CRC extension
 * @param {vscode.ExtensionContext} context - VSCode extension context
 */
export async function activate(context: vscode.ExtensionContext) {
  Logger.info(MESSAGES.ACTIVATION);

  // Forcer la nouvelle valeur du configLabel
  await enforceConfigLabel();

  // Initialize Status Bar Manager
  statusBarManager = StatusBarManager.getInstance(COMMANDS.STATUS_BAR_CLICK);
  context.subscriptions.push(statusBarManager);

  // Register commands
  registerCommands(context);

  // Schedule periodic checks
  checkInterval = setInterval(async () => {
    try {
      await checkRemoteConfigStatus();
    } catch (error) {
      Logger.error("Periodic check failed:", error);
      if (error instanceof Error) {
        statusBarManager.setError(error.message);
      }
    }
  }, CHECK_INTERVAL_MS);

  // Initial check
  await checkRemoteConfigStatus();
}

/**
 * Gets Windows drive letter in WSL
 * @returns {string} Drive letter (default: 'c')
 */
function getWindowsDrive(): string {
  // Windows env. variable
  const winHome = process.env.WSLENV_USERPROFILE;

  if (winHome) {
    const match = winHome.match(/^([A-Za-z]):/);
    if (match) {
      const drive = match[1].toLowerCase();
      Logger.debug(`Windows drive detected from env: ${drive}`);
      return drive;
    }
  }

  // Check mount drive
  try {
    const mntDirs = fs.readdirSync("/mnt");
    // Look for users dir
    for (const drive of mntDirs) {
      const usersPath = `/mnt/${drive}/Users`;
      try {
        fs.accessSync(usersPath, fs.constants.F_OK);
        Logger.info(`Windows drive found: ${drive}`);
        return drive;
      } catch {
        continue;
      }
    }
  } catch (error) {
    Logger.debug("Could not read /mnt directory");
  }

  Logger.debug("Using default drive: c");
  return "c";
}

/**
 * Gets the user home directory with WSL2 support
 * In WSL context, returns Windows home directory path
 * @returns {string} User home directory path
 */
async function getUserHomeDirectory(): Promise<string> {
  const config = vscode.workspace.getConfiguration("crc");
  const customHome = config.get<string>("userHomeDirectory");

  if (customHome && customHome.length > 0) {
    if (await isPathAccessible(customHome)) {
      return customHome;
    }
    Logger.warning(
      `Custom home directory not accessible: ${customHome}, falling back`,
    );
  }

  if (isWSLEnvironment()) {
    const username = process.env.USER || process.env.USERNAME;
    if (username) {
      const drive = getWindowsDrive();
      const windowsHome = `/mnt/${drive}/Users/${username}`;

      if (await isPathAccessible(windowsHome)) {
        Logger.info(`WSL detected, using Windows home: ${windowsHome}`);
        return windowsHome;
      }
      Logger.warning(
        `Windows home not accessible: ${windowsHome}, using Linux home`,
      );
    }
  }

  const home = homedir();
  Logger.debug(`Using OS home directory: ${home}`);
  return home;
}

/**
 * Enforces the configuration label to a new value if it is deprecated or not set
 * @returns {Promise<void>}
 */
async function enforceConfigLabel(): Promise<void> {
  const config = vscode.workspace.getConfiguration("crc");
  const currentLabel = config.get<string>("configLabel");

  if (!currentLabel || currentLabel.endsWith(".json")) {
    Logger.info(`Enforcing config label from "${currentLabel}" to: ${FILES.DEFAULT}`);
    await config.update(
      "configLabel",
      FILES.DEFAULT,
      vscode.ConfigurationTarget.Global,
    );
  }
}

/**
 * Registers extension commands
 * @param {vscode.ExtensionContext} context - VSCode extension context
 * @private
 */
function registerCommands(context: vscode.ExtensionContext): void {
  // Register load command
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.LOAD, () => {
      vscode.window.showInformationMessage(MESSAGES.LOAD);
    }),
  );

  // Register status bar click command
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.STATUS_BAR_CLICK, async () => {
      const selectedOption = await vscode.window.showQuickPick([
        QUICK_PICK_OPTIONS.EDIT_SETTINGS,
        QUICK_PICK_OPTIONS.DOWNLOAD_CONFIG,
      ]);

      if (selectedOption === QUICK_PICK_OPTIONS.EDIT_SETTINGS) {
        vscode.commands.executeCommand("workbench.action.openSettings", "crc");
      } else if (selectedOption === QUICK_PICK_OPTIONS.DOWNLOAD_CONFIG) {
        try {
          statusBarManager.setUpdating();
          await getRemoteConfig();
          vscode.window.showInformationMessage(MESSAGES.DOWNLOAD_SUCCESS);
        } catch (error) {
          if (error instanceof Error) {
            statusBarManager.setError(error.message);
            vscode.window.showErrorMessage(
              MESSAGES.DOWNLOAD_ERROR(error.message),
            );
          }
        }
      }
    }),
  );
}

/**
 * Fetches and applies remote configuration
 * @throws {Error} If configuration retrieval or application fails
 * @returns {Promise<void>}
 */
async function getRemoteConfig(): Promise<void> {
  const config = vscode.workspace.getConfiguration("crc");
  const endpoint = getConfigValue<string>(config, "remoteEndPoint");
  const label = getConfigValue<string>(config, "configLabel");
  const userDirectory = await getUserHomeDirectory();

  const pathManager = new PathManager(userDirectory);
  await pathManager.ensureDirectoryExists();

  const remoteData = await fetchRemoteConfig(endpoint, label);

  await fs.promises.writeFile(pathManager.defaultPath, remoteData);
  await fs.promises.writeFile(pathManager.tmpPath, remoteData);

  try {
    await replaceApiKeyInFile(pathManager.tmpPath, config);
    await replaceConfigFile(pathManager.tmpPath, pathManager.configPath);
  } catch (error) {
    // Cleanup temp file on error
    await fs.promises.unlink(pathManager.tmpPath).catch(() => {});
    throw error;
  }

  await checkRemoteConfigStatus();
}

/**
 * Gets a configuration value with validation
 * @template T Configuration value type
 * @param {vscode.WorkspaceConfiguration} config - Workspace configuration
 * @param {string} key - Configuration key
 * @throws {Error} If value is not defined
 * @returns {T} Configuration value
 */
function getConfigValue<T>(
  config: vscode.WorkspaceConfiguration,
  key: string,
): T {
  const value = config.get<T>(key);
  if (!value) {
    throw new Error(MESSAGES.CONFIG_ERROR(key));
  }
  return value;
}

/**
 * Fetches configuration from remote server
 * @param {string} endpoint - Remote server URL
 * @param {string} label - Configuration label
 * @throws {Error} On download failure
 * @returns {Promise<string>} Configuration data
 */
async function fetchRemoteConfig(
  endpoint: string,
  label: string,
  timeoutMs: number = HTTP_TIMEOUT_MS,
): Promise<string> {
  let url: URL;
  try {
    url = new URL(label, endpoint);
  } catch (error) {
    Logger.error(`Invalid URL: ${endpoint} / ${label}`);
    throw new Error(`Invalid URL configuration`);
  }

  Logger.info(`Fetching remote config from: ${url.toString()}`);

  return new Promise<string>((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode !== 200) {
        Logger.error(`Download error, status code: ${response.statusCode}`);
        reject(new Error(`Download error, status code: ${response.statusCode}`));
        return;
      }

      let data = "";
      response.on("data", (chunk) => (data += chunk));
      response.on("end", () => {
        Logger.debug(`Successfully fetched ${data.length} bytes`);
        resolve(data);
      });
    });

    request.on("error", (error) => {
      Logger.error(`Download error: ${error.message}`);
      reject(new Error(`Download error: ${error.message}`));
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy();
      Logger.warning(`Request timeout after ${timeoutMs}ms for ${url.toString()}`);
      reject(new Error(`Request timeout after ${timeoutMs}ms`));
    });
  });
}

/**
 * Replaces API key in configuration file
 * @param {string} filePath - File path
 * @param {vscode.WorkspaceConfiguration} config - Configuration
 * @returns {Promise<void>}
 */
async function replaceApiKeyInFile(
  filePath: string,
  config: vscode.WorkspaceConfiguration,
): Promise<void> {
  const apiKeyPattern = config.get<string>("apiKeyPattern");
  const apiKey = config.get<string>("apiKey");

  if (
    apiKey &&
    apiKey.length > 0 &&
    apiKeyPattern &&
    apiKeyPattern.length > 0
  ) {
    Logger.debug(`Replacing API key in: ${filePath}`);
    let fileContent = await fs.promises.readFile(filePath, "utf-8");
    const regex = new RegExp(apiKeyPattern, "g");
    const matches = fileContent.match(regex);

    if (matches) {
      Logger.debug(`Found ${matches.length} API key placeholder(s)`);
      fileContent = fileContent.replace(regex, apiKey);
      await fs.promises.writeFile(filePath, fileContent);
      Logger.info(`API key replaced successfully`);
    }
  } else {
    Logger.debug(`Skipping API key replacement (not configured)`);
  }
}

/**
 * Replaces configuration file
 * @param {string} tmpFilePath - Temporary file path
 * @param {string} newFilePath - New file path
 * @returns {Promise<void>}
 */
async function replaceConfigFile(
  tmpFilePath: string,
  newFilePath: string,
): Promise<void> {
  try {
    await fs.promises.access(newFilePath, fs.constants.F_OK);
    Logger.debug(`Removing existing config file: ${newFilePath}`);
    await fs.promises.unlink(newFilePath);
  } catch {
    Logger.debug(`No existing config file to remove`);
  }
  Logger.info(`Moving ${tmpFilePath} to ${newFilePath}`);
  await fs.promises.rename(tmpFilePath, newFilePath);
}

/**
 * Checks remote configuration status
 * @returns {Promise<void>}
 */
async function checkRemoteConfigStatus(): Promise<void> {
  try {
    statusBarManager.setUpdating();
    Logger.debug("Starting remote configuration status check");

    const config = vscode.workspace.getConfiguration("crc");
    const endpoint = getConfigValue<string>(config, "remoteEndPoint");
    const label = getConfigValue<string>(config, "configLabel");
    const userDirectory = await getUserHomeDirectory();

    const pathManager = new PathManager(userDirectory);
    const defaultFilePath = pathManager.defaultPath;

    const remoteData = await fetchRemoteConfig(endpoint, label);

    let localData: string;
    try {
      localData = await fs.promises.readFile(defaultFilePath, "utf-8");
    } catch (error) {
      Logger.warning(`Local config file not found: ${defaultFilePath}`);
      statusBarManager.setOutOfDate();
      return;
    }

    // Normalize line endings for comparison
    const normalizedRemote = remoteData.replace(/\r\n/g, "\n").trim();
    const normalizedLocal = localData.replace(/\r\n/g, "\n").trim();

    if (normalizedRemote === normalizedLocal) {
      Logger.info("Configuration is up to date");
      statusBarManager.setUpToDate();
    } else {
      Logger.warning("Configuration is out of date");
      statusBarManager.setOutOfDate();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    statusBarManager.setError(errorMessage);
    Logger.error("Check remote config status failed:", errorMessage);
  }
}

/**
 * Deactivates the extension
 * Releases used resources
 */
export function deactivate() {
  Logger.info("Deactivating CRC extension");

  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = undefined;
    Logger.debug("Cleared check interval");
  }
  if (statusBarManager) {
    statusBarManager.dispose();
    Logger.debug("Disposed status bar manager");
  }
}
