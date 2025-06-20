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
import { StatusBarManager } from './statusbar';

/**
 * Interval configuration
 * @constant {number} CHECK_INTERVAL_MS - Check interval in milliseconds (30 minutes)
 */
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes en millisecondes

/**
 * Extension command IDs
 * @namespace
 * @property {string} STATUS_BAR_CLICK - Status bar click command
 * @property {string} LOAD - Extension load command
 */
const COMMANDS = {
    STATUS_BAR_CLICK: "crcExtension.statusBarClick",
    LOAD: "central-remote-config.load"
};

/**
 * Quick Pick menu options
 * @namespace
 * @property {string} EDIT_SETTINGS - Settings edition option
 * @property {string} DOWNLOAD_CONFIG - Configuration download option
 */
const QUICK_PICK_OPTIONS = {
    EDIT_SETTINGS: "Edit settings",
    DOWNLOAD_CONFIG: "Download remote configuration"
};

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
    DEFAULT: "default.yaml"
};

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
    CONFIG_ERROR: (key: string) => `${key} is not defined, please update "Edit settings".`
};

// Status Bar Manager instance
let statusBarManager: StatusBarManager;

/**
 * Activates the CRC extension
 * @param {vscode.ExtensionContext} context - VSCode extension context
 */
export function activate(context: vscode.ExtensionContext) {
    console.log(MESSAGES.ACTIVATION);

    // Forcer la nouvelle valeur du configLabel
    enforceConfigLabel();

    // Initialize Status Bar Manager
    statusBarManager = StatusBarManager.getInstance(COMMANDS.STATUS_BAR_CLICK);
    context.subscriptions.push(statusBarManager);

    // Register commands
    registerCommands(context);

    // Schedule periodic checks
    setInterval(async () => {
        await checkRemoteConfigStatus();
    }, CHECK_INTERVAL_MS);

    // Initial check
    checkRemoteConfigStatus();
}

/**
 * Enforces the configuration label to a new value if it is deprecated or not set
 * @returns {Promise<void>}
 */
async function enforceConfigLabel(): Promise<void> {
    const config = vscode.workspace.getConfiguration("crc");
    const currentLabel = config.get<string>("configLabel");
    const newLabel = "default.yaml";
    if (!currentLabel || currentLabel.endsWith(".json")) {
        await config.update("configLabel", newLabel, vscode.ConfigurationTarget.Global);
    }
}

/**
 * Registers extension commands
 * @param {vscode.ExtensionContext} context - VSCode extension context
 * @private
 */
function registerCommands(context: vscode.ExtensionContext) {
    // Register load command
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.LOAD, () => {
            vscode.window.showInformationMessage(MESSAGES.LOAD);
        })
    );

    // Register status bar click command
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.STATUS_BAR_CLICK, async () => {
            const selectedOption = await vscode.window.showQuickPick([
                QUICK_PICK_OPTIONS.EDIT_SETTINGS,
                QUICK_PICK_OPTIONS.DOWNLOAD_CONFIG
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
                        vscode.window.showErrorMessage(MESSAGES.DOWNLOAD_ERROR(error.message));
                    }
                }
            }
        })
    );
}

/**
 * Fetches and applies remote configuration
 * @throws {Error} If configuration retrieval or application fails
 * @returns {Promise<void>}
 */
async function getRemoteConfig(): Promise<void> {
    try {
        const config = vscode.workspace.getConfiguration("crc");
        const endpoint = getConfigValue<string>(config, "remoteEndPoint");
        const label = getConfigValue<string>(config, "configLabel");
        const continueDirectory = getContinueDirectory(config);
        const userDirectory = homedir();
        const tmpFilePath = path.join(userDirectory, continueDirectory, FILES.CONFIG_TMP);
        const configFilePath = path.join(userDirectory, continueDirectory, FILES.CONFIG);
        const defaultFilePath = path.join(userDirectory, continueDirectory, FILES.DEFAULT);

        const remoteData = await fetchRemoteConfig(endpoint, label);

        await fs.promises.writeFile(defaultFilePath, remoteData);
        await fs.promises.writeFile(tmpFilePath, remoteData);
        await replaceApiKeyInFile(tmpFilePath, config);
        await replaceConfigFile(tmpFilePath, configFilePath);
        await checkRemoteConfigStatus();
    } catch (error) {
        handleError(error);
    }
}

/**
 * Upgrades the CRC configuration to the latest version if needed.
 *
 * This function checks the current configuration version stored in the
 * workspace settings under the "crc" namespace. If the version is "1.0",
 * it updates the configuration to version "2.0" by performing the following:
 * - Updates the "configLabel" setting to "default.yaml" if it ends with ".json".
 * - Updates the "configVersion" setting to "2.0".
 * - Displays an informational message to notify the user about the upgrade.
 *
 * @returns A promise that resolves when the configuration upgrade process is complete.
 */
async function upgradeConfigurationIfNeeded(): Promise<void> {
    const config = vscode.workspace.getConfiguration("crc");
    const configVersion = config.get<string>("configVersion") || "1.0";

    if (configVersion === "1.0") {
        // Mettre à jour les paramètres pour la version 2.0
        const configLabel = config.get<string>("configLabel");
        if (configLabel && configLabel.endsWith('.json')) {
            await config.update("configLabel", "default.yaml", true);
        }
        await config.update("configVersion", "2.0", true);
        vscode.window.showInformationMessage("CRC: Configuration mise à jour vers la version 2.0");
    }
}

/**
 * Gets a configuration value with validation
 * @template T Configuration value type
 * @param {vscode.WorkspaceConfiguration} config - Workspace configuration
 * @param {string} key - Configuration key
 * @throws {Error} If value is not defined
 * @returns {T} Configuration value
 */
function getConfigValue<T>(config: vscode.WorkspaceConfiguration, key: string): T {
    const value = config.get<T>(key);
    if (!value) {
        throw new Error(MESSAGES.CONFIG_ERROR(key));
    }
    return value;
}

/**
 * Gets Continue directory path
 * @param {vscode.WorkspaceConfiguration} config - Workspace configuration
 * @returns {string} Continue directory path
 */
function getContinueDirectory(config: vscode.WorkspaceConfiguration): string {
    const continueDirectory = config.get<string>("continueDirectory");
    return continueDirectory && continueDirectory.length > 0 ? continueDirectory : ".";
}

/**
 * Fetches configuration from remote server
 * @param {string} endpoint - Remote server URL
 * @param {string} label - Configuration label
 * @throws {Error} On download failure
 * @returns {Promise<string>} Configuration data
 */
async function fetchRemoteConfig(endpoint: string, label: string): Promise<string> {
    const url = new URL(label, endpoint);
    return new Promise<string>((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Download error, status code: ${response.statusCode}`));
                return;
            }
            let data = "";
            response.on("data", (chunk) => (data += chunk));
            response.on("end", () => resolve(data));
        }).on("error", (error) => reject(new Error(`Download error: ${error.message}`)));
    });
}

/**
 * Replaces API key in configuration file
 * @param {string} filePath - File path
 * @param {vscode.WorkspaceConfiguration} config - Configuration
 * @returns {Promise<void>}
 */
async function replaceApiKeyInFile(filePath: string, config: vscode.WorkspaceConfiguration): Promise<void> {
    const apiKeyPattern = config.get<string>("apiKeyPattern");
    const apiKey = config.get<string>("apiKey");

    if (apiKey && apiKey.length > 0 && apiKeyPattern && apiKeyPattern.length > 0) {
        let fileContent = await fs.promises.readFile(filePath, "utf-8");
        const regex = new RegExp(apiKeyPattern, "g");
        fileContent = fileContent.replace(regex, apiKey);
        await fs.promises.writeFile(filePath, fileContent);
    }
}

/**
 * Replaces configuration file
 * @param {string} tmpFilePath - Temporary file path
 * @param {string} newFilePath - New file path
 * @returns {Promise<void>}
 */
async function replaceConfigFile(tmpFilePath: string, newFilePath: string): Promise<void> {
    try {
        await fs.promises.access(newFilePath, fs.constants.F_OK);
        await fs.promises.unlink(newFilePath);
    } catch {
        // File does not exist, no action needed
    }
    await fs.promises.rename(tmpFilePath, newFilePath);
}

/**
 * Checks remote configuration status
 * @returns {Promise<void>}
 */
async function checkRemoteConfigStatus(): Promise<void> {
    try {
        statusBarManager.setUpdating();
        const config = vscode.workspace.getConfiguration("crc");
        const endpoint = getConfigValue<string>(config, "remoteEndPoint");
        const label = getConfigValue<string>(config, "configLabel");
        const continueDirectory = getContinueDirectory(config);
        const userDirectory = homedir();
        const defaultFilePath = path.join(userDirectory, continueDirectory, FILES.DEFAULT);

        const remoteData = await fetchRemoteConfig(endpoint, label);
        const localData = await fs.promises.readFile(defaultFilePath, "utf-8");

        if (remoteData === localData) {
            statusBarManager.setUpToDate();
        } else {
            statusBarManager.setOutOfDate();
        }
    } catch (error) {
        statusBarManager.setError(error instanceof Error ? error.message : 'Unknown error');
        console.error(error);
    }
}

/**
 * Handles extension errors
 * @param {unknown} error - Error to handle
 * @throws {Error} Formatted error
 */
function handleError(error: unknown): void {
    if (error instanceof Error) {
        throw new Error(`Error: ${error.message}`);
    } else {
        throw new Error("An unknown error occurred");
    }
}

/**
 * Deactivates the extension
 * Releases used resources
 */
export function deactivate() {
    if (statusBarManager) {
        statusBarManager.dispose();
    }
}
