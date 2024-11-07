/*
 * Software Name : VSCode CRC: central-remote-config
 * SPDX-FileCopyrightText: Copyright (c) FX Soubirou - Orange SA
 * SPDX-License-Identifier: MIT
 *
 * This software is distributed under the MIT License,
 * see the "LICENSE.txt" file for more details or https://spdx.org/licenses/MIT.html
 *
 * Authors: FX Soubirou - Orange SA
 * Software description: An extension to set the configuration of
 * the Continue extension from a remote server.
 */
import * as vscode from "vscode";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "central-remote-config" is now active!');

  createStatusBarItem(context);

  const disposable = vscode.commands.registerCommand(
    "central-remote-config.load",
    () => {
      // Load configuration from settings
      vscode.window.showInformationMessage(
        "CRC: central-remote-config extension loaded!"
      );
    }
  );

  context.subscriptions.push(disposable);
}

function createStatusBarItem(context: vscode.ExtensionContext) {
  // register a command that is invoked when the status bar
  // item is clicked.
  const crcCommandId = "crcExtension.statusBarClick";
  context.subscriptions.push(
    vscode.commands.registerCommand(crcCommandId, async () => {
      const pageType = await vscode.window
        .showQuickPick(["Edit settings", "Download remote configuration"])
        .then((item) => {
          if (item === "Edit settings") {
            vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "crc"
            );
          } else if (item === "Download remote configuration") {
            getRemoteConfig()
              .then(() => {
                vscode.window.showInformationMessage(
                  "Remote configuration downloaded successfully!"
                );
              })
              .catch((error) => {
                vscode.window.showErrorMessage(
                  `Error during donwload: ${error.message}`
                );
              });
          }
        });
    })
  );

  // Status bar
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBar.command = crcCommandId;
  context.subscriptions.push(statusBar);
  statusBar.text = "CRC";
  statusBar.tooltip = "Central Remote Config";
  statusBar.show();
}

async function getRemoteConfig(): Promise<void> {
  try {
    // Get user settings: remoteEndPoint, configLabel, continueDirectory
    const config = vscode.workspace.getConfiguration("crc");
    const endpoint = config.get<string>("remoteEndPoint");
    if (!endpoint) {
      throw new Error(
        'remoteEndPoint is not defined, please update "Edit settings".'
      );
    }
    const label = config.get<string>("configLabel");
    if (!label) {
      throw new Error(
        'configLabel is not defined, please update "Edit settings".'
      );
    }
    const userDirectory = homedir();
    const continueDirectoryConfig = config.get<string>("continueDirectory");
    // If continue directory not defined use homedir
    const continueDirectory =
      continueDirectoryConfig && continueDirectoryConfig.length > 0
        ? continueDirectoryConfig
        : ".";
    const tmpFilePath = path.join(
      userDirectory,
      continueDirectory,
      "config.json.tmp"
    );

    // Get remote config file content
    const url = new URL(path.join(endpoint, label));
    const data = await new Promise<string>((resolve, reject) => {
      https
        .get(url, (response) => {
          if (response.statusCode !== 200) {
            reject(
              new Error(`Download error, status code: ${response.statusCode}`)
            );
            return;
          }
          let data = "";
          response.on("data", (chunk) => {
            data += chunk;
          });

          response.on("end", () => {
            resolve(data);
          });
        })
        .on("error", (error) => {
          reject(new Error(`Download error: ${error.message}`));
        });
    });

    await fs.promises.writeFile(tmpFilePath, data);

    // Replace API key pattern in remote config with user API key
    const apiKeyPattern = config.get<string>("apiKeyPattern");
    const apiKey = config.get<string>("apiKey");
    if (
      apiKey &&
      apiKey.length > 0 &&
      apiKeyPattern &&
      apiKeyPattern.length > 0
    ) {
      let fileContent = await fs.promises.readFile(tmpFilePath, "utf-8");
      const regex = new RegExp(apiKeyPattern, "g");
      fileContent = fileContent.replace(regex, apiKey);
      await fs.promises.writeFile(tmpFilePath, fileContent);
    }

    // Remplacement of file config.json
    const newFilePath = path.join(
      userDirectory,
      continueDirectory,
      "config.json"
    );
    try {
      await fs.promises.access(newFilePath, fs.constants.F_OK);
      await fs.promises.unlink(newFilePath);
    } catch (err) {
      // new file doesn't exist, don't remove
    }
    await fs.promises.rename(tmpFilePath, newFilePath);
  } catch (error: Error | unknown) {
    if (error instanceof Error) {
      throw new Error(`Error: ${error.message}`);
    } else {
      throw new Error("An unknown error occurred");
    }
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}
