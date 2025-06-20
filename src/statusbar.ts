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

/**
 * @class StatusBarManager
 * @description Manages the display and states of the CRC extension status bar.
 * Implements Singleton pattern to ensure single instance.
 */
export class StatusBarManager {
    /** Unique instance of the class (Singleton pattern) */
    private static instance: StatusBarManager;

    /** VSCode status bar element */
    private statusBarItem: vscode.StatusBarItem;

    /**
     * Status bar configuration
     * @static
     * @readonly
     */
    private static readonly CONFIG = {
        /** Alignment of the element in the status bar */
        ALIGNMENT: vscode.StatusBarAlignment.Right,
        /** Display priority (the higher the number, the more to the right the element is) */
        PRIORITY: 100,
        /** Definition of the different possible states of the status bar */
        STATES: {
            /** Default state - displayed during initialization */
            DEFAULT: {
                TEXT: "CRC",
                TOOLTIP: "Central Remote Config"
            },
            /** State when the configuration is up-to-date */
            UP_TO_DATE: {
                TEXT: "CRC ✔",
                TOOLTIP: "Configuration locale à jour",
                COLOR: new vscode.ThemeColor("statusBar.foreground")
            },
            /** State when the configuration is not up-to-date */
            OUT_OF_DATE: {
                TEXT: "CRC ✘",
                TOOLTIP: "Configuration locale non à jour. Veuillez la mettre à jour",
                COLOR: new vscode.ThemeColor("errorForeground")
            },
            /** State in case of error */
            ERROR: {
                TEXT: "CRC ✘",
                TOOLTIP: "Erreur lors de la vérification de la configuration",
                COLOR: new vscode.ThemeColor("errorForeground")
            },
            /** State during update */
            UPDATING: {
                TEXT: "CRC $(sync~spin)", // Animated sync icon
                TOOLTIP: "Mise à jour en cours...",
                COLOR: new vscode.ThemeColor("statusBar.foreground")
            }
        }
    };

    /**
     * Private constructor to implement the Singleton pattern
     * @param command - Command to execute on status bar click
     */
    private constructor(command: string) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            StatusBarManager.CONFIG.ALIGNMENT,
            StatusBarManager.CONFIG.PRIORITY
        );
        this.statusBarItem.command = command;
        this.setDefaultState();
        this.statusBarItem.show();
    }

    /**
     * Gets the unique instance of StatusBarManager
     * @static
     * @param {string} command - Command to execute on click
     * @returns {StatusBarManager} Unique instance
     */
    public static getInstance(command: string): StatusBarManager {
        if (!StatusBarManager.instance) {
            StatusBarManager.instance = new StatusBarManager(command);
        }
        return StatusBarManager.instance;
    }

    /**
     * Releases the resources used by the status bar
     */
    public dispose(): void {
        this.statusBarItem.dispose();
    }

    /**
     * Sets the default state of the status bar
     */
    public setDefaultState(): void {
        this.updateState(StatusBarManager.CONFIG.STATES.DEFAULT);
    }

    /**
     * Sets the up-to-date state of the status bar
     */
    public setUpToDate(): void {
        this.updateState(StatusBarManager.CONFIG.STATES.UP_TO_DATE);
    }

    /**
     * Sets the out-of-date state of the status bar
     */
    public setOutOfDate(): void {
        this.updateState(StatusBarManager.CONFIG.STATES.OUT_OF_DATE);
    }

    /**
     * Sets the error state of the status bar
     * @param errorMessage - Optional error message to display in the tooltip
     */
    public setError(errorMessage?: string): void {
        const state = StatusBarManager.CONFIG.STATES.ERROR;
        if (errorMessage) {
            state.TOOLTIP = `${state.TOOLTIP}: ${errorMessage}`;
        }
        this.updateState(state);
    }

    /**
     * Sets the updating state of the status bar
     */
    public setUpdating(): void {
        this.updateState(StatusBarManager.CONFIG.STATES.UPDATING);
    }

    /**
     * Updates status bar state
     * @private
     * @param {Object} state - New state
     * @param {string} state.TEXT - Display text
     * @param {string} state.TOOLTIP - Tooltip text
     * @param {vscode.ThemeColor} [state.COLOR] - Optional color
     */
    private updateState(state: {
        TEXT: string;
        TOOLTIP: string;
        COLOR?: vscode.ThemeColor
    }): void {
        this.statusBarItem.text = state.TEXT;
        this.statusBarItem.tooltip = state.TOOLTIP;
        if (state.COLOR) {
            this.statusBarItem.color = state.COLOR;
        }
    }

    /**
     * Displays the status bar
     */
    public show(): void {
        this.statusBarItem.show();
    }

    /**
     * Hides the status bar
     */
    public hide(): void {
        this.statusBarItem.hide();
    }
}
