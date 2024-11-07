# VSCode Central Remote Configuration

![Logo CRC](https://raw.githubusercontent.com/fxsoubirou/vsc-crc-media/refs/heads/main/crc_icon.png "Logo CRC")

## Overview

[![Software License](https://img.shields.io/badge/license-MIT-informational.svg?style=for-the-badge)](https://spdx.org/licenses/MIT.html)

**The source code will be available shortly.**

The **VSCode Central Remote Config extension** allows users to load and configure their [Continue](https://www.continue.dev/) settings from a remote server. This extension provides a simple way to manage `~/.continue/config.json` Continue configuration file, replacing placeholders with user-provided API key.

![CRC settings](https://raw.githubusercontent.com/fxsoubirou/vsc-crc-media/refs/heads/main/crc_settings.png "CRC Settings")

### Features

* Load configuration `<Config Label>` from the remote server `<Remote End Point>`.
* Automatically replace placeholders `<Api Key Pattern>` in the configuration file with user-provided API key `<Api Key>`.
* Edit settings and download remote configuration options from the status bar `CRC` icon.

### Installation

1. Open VSCode and navigate to the Extensions panel.
1. Search for "central-remote-config" in the Marketplace.
1. Click on the extension result to open its details page.
1. Click on the `Install` button to install the extension.

### Usage

1. Click on the `CRC` status bar item and select `Edit settings` to open the settings panel.
1. Update the configuration options as needed.

| Settings           | Description                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| Remote End Point   | The remote end-point of the remote configuration file.                                                      |
| Api Key            | The user API key that replaces the **Api Key Pattern** pattern in the remote configuration file. (Optional) |
| Config Label       | The name of the remote configuration file. Default value: `default.json`.                                 |
| Api Key Pattern    | The pattern to substitute in the remote configuration file. Default value: `__CRC_API_KEY__` .            |
| Continue Directory | The configuration continue directory. Default value: `.continue`.                                         |

1. Click on the `CRC` status bar item and select `Download remote configuration` to install the updated configuration file.

Example of a template remote configuration file:

``` json
{
    "models": [
      {
        "title": "llama-3.2",
        "provider": "ollama",
        "apiBase": "https://model01.example.com:11434",
        "apiKey": "__CRC_API_KEY__",
        "model": "llama3.2:3b",
        "completionOptions": {}
      },
      ...
```

## Contributing

### Make changes

* Press `F5` to open a new window with your extension loaded.
* You can relaunch the extension from the debug toolbar after changing code in `src/extension.ts`.
* You can also reload (`Ctrl+R` or `Cmd+R` on Mac) the VS Code window with your extension to load your changes.

### Run linters and tests

``` shell
task ...
 npm run test
```

### Manual package and local test extension

``` shell
npm run package
npm install -g @vscode/vsce
# Generate the `.vsix` file.
vsce package
```

Follow the [official documentation](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#packaging-extensions) for more details on packaging and installing an extension without publishing it to the marketplace.

### Deployment

* Reduce the extension size and improve the startup time by [bundling your extension](https://code.visualstudio.com/api/working-with-extensions/bundling-extension).
* [Publish your extension](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) on the VS Code extension marketplace.
* Automate builds by setting up [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration).

## License

This software is distributed under the MIT License, see the LICENSE.txt file for more details or visit [https://spdx.org/licenses/MIT.html](https://spdx.org/licenses/MIT.html).

## Contributors

* FX Soubirou (Orange SA) - Initial work
