NEUROSURGE: OPEN THE CURRENT PREVIEW

Open the browser game and use its keyboard, mouse or trackpad controls. Rendering and simulation run on your computer; the site supplies the files. A modern browser with JavaScript and WebGL is required.

Windows: download NeuroSurge-Windows.url and double-click it.
macOS: download NeuroSurge-macOS.webloc and double-click it.
Linux: open NeuroSurge-Linux.desktop with your desktop's normal launcher handling.
Keep each filename's extension. If the browser displays the file as text,
download the ZIP, extract it, and open the launcher for your system.
Follow normal OS opening/trust prompts. Native Windows/macOS operation has
not been tested by this package's Linux-only format checks.

For a Linux application-menu entry, extract the ZIP, open a terminal in that
folder and run:
  sh Install-NeuroSurge-Linux.sh
The installer opens no browser. It writes one per-user application entry in
${XDG_DATA_HOME:-$HOME/.local/share}/applications. It prefers the installed
Omarchy web-app opener, otherwise xdg-open. It needs normal Linux shell/core
utilities and a configured browser; it installs no software or background job.
An identical managed entry is left intact. Any different file or symlink
using the destination name is preserved. The URL stays current when the
published preview changes, so a new build does not require reinstallation.
To remove the menu entry later, delete brain2body-neurosurge.desktop from the
location printed by the installer. Downloaded bookmarks can be deleted normally.

Direct preview: https://eliminatenoise.github.io/NeuroSurge/
Project and source: https://github.com/eliminatenoise/NeuroSurge
Source ZIP: https://github.com/eliminatenoise/NeuroSurge/archive/refs/heads/main.zip

The game is experimental. Its movement and colours are simulated; it does not decode neural recordings or establish validated joint mechanics or clinical function.

These are online URL launchers, not offline model/app bundles. Opening the
public preview needs a network connection and browser. No Node/Python install
is needed to open it. Document viewing may use your normal PDF/DOCX application.
The launchers contain no weights, recordings, credentials or private paths.
SHA256SUMS identifies the five launcher/instruction files in this package;
it does not establish OS trust, scientific validation or source authentication.
