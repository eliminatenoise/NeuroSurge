# Open NeuroSurge

[Play the browser preview](https://neurosurge-public-preview-20261110.tr1-set.chatgpt.site/scene/example/preview.html) or use the [start page and downloads](START.html). The launcher files in this package target the same online preview host. GitHub remains the [canonical source](https://github.com/eliminatenoise/NeuroSurge); older saved bookmarks can still point to an earlier hosting address, so replace them with the files from this package when updating.

The game uses your computer's CPU/GPU through the browser. You need a network connection to open the online version, JavaScript, WebGL, a keyboard and a mouse or trackpad. The launchers are bookmarks, not offline game bundles. They contain no trained model or neural recordings and install no runtime, paid service or background job.

| System | File and use |
| --- | --- |
| Windows | Download [NeuroSurge-Windows.url](launchers/NeuroSurge-Windows.url) and double-click the saved file. |
| macOS | Download [NeuroSurge-macOS.webloc](launchers/NeuroSurge-macOS.webloc) and double-click the saved file. |
| Linux | Open [NeuroSurge-Linux.desktop](launchers/NeuroSurge-Linux.desktop) using your desktop's normal launcher handling. |
| All three | Download and extract [NeuroSurge-Launchers.zip](launchers/NeuroSurge-Launchers.zip). Use the file for your system. |

Keep each filename extension. If a bookmark opens as text in the browser, download and extract the ZIP instead. Follow normal OS opening/trust prompts; do not disable system security to open it.

For a Linux application-menu entry, extract the ZIP, open a terminal in that folder and run `sh Install-NeuroSurge-Linux.sh`. The installer writes one per-user entry, opens no browser and prefers the installed Omarchy opener or falls back to xdg-open. An exact older project launcher is backed up and updated. Custom files are preserved. If the installer reports an unrecognized entry, inspect it before deciding whether to remove your own shortcut; it will not replace that file. To uninstall the managed entry, remove `brain2body-neurosurge.desktop` from the location printed by the installer. Downloaded bookmarks can be deleted normally.

The Windows/macOS formats have been checked as files; native opening remains unverified. An earlier Linux installation and desktop-entry launch worked, but the updated target has not yet had its own native launch check. A valid bookmark format does not establish compatibility with every OS or browser.

This is experimental-2026-11-11-capture-update. Its signals are simulated and unitless. See [controls and current limits](PREVIEW-NOTES.html) before demonstrating it. For a local copy, download the [repository source ZIP](https://github.com/eliminatenoise/NeuroSurge/archive/refs/heads/main.zip), extract it and run `node serve-local.mjs` with Node.js 18 or later. That serves files on this computer; opening the HTML directly from disk is not the same route.
