NEUROSURGE: OPEN THE PREVIEW

Open the game, move the arm, and see the simulated activity change. The scene
runs in your browser on your computer. You need a network connection and a
modern browser with JavaScript and WebGL; no Node or Python installation.

Preview: https://neurosurge-public-preview-20261110.tr1-set.chatgpt.site/scene/example/preview.html
Package: experimental-2026-11-11-pointer-release

Download the ZIP and extract it. Then open the file for your system:
  Windows: NeuroSurge-Windows.url
  macOS: NeuroSurge-macOS.webloc
  Linux: NeuroSurge-Linux.desktop
Keep the filename extension and follow your operating system's normal opening
and trust prompts. Windows and macOS files have been format-checked on Linux;
opening them on those systems has not been tested.

To add NeuroSurge to the Linux application menu, open a terminal in the
extracted folder and run:
  sh Install-NeuroSurge-Linux.sh
The installer opens no browser. It writes one entry to
${XDG_DATA_HOME:-$HOME/.local/share}/applications, using the installed Omarchy
web-app opener when available and xdg-open otherwise. Normal Linux shell/core
utilities and a configured browser are required; it installs no other software.

An identical entry stays as it is. An exact older NeuroSurge entry is updated,
with its previous contents saved at the backup path printed by the installer.
Custom files, symlinks and directories using that name are preserved. Run the
installer while no other program is editing the entry: its lock coordinates
copies of this installer, but cannot exclude unrelated writers. If a lock is
left after an interrupted run, first check that no installer is running before
removing the empty .brain2body-neurosurge.install.lock directory at that location.
To remove the menu entry, delete brain2body-neurosurge.desktop from the printed
location. Keep any backup you want, or delete it separately. Downloaded launcher
files can be deleted normally.

The shortcut opens the online preview at the same address as it changes. It
does not contain an offline game, trained model, neural recording or decoder.
NeuroSurge uses simulated movement and colours. It does not decode neural
recordings or demonstrate validated joint mechanics or clinical function.

Project and source: https://github.com/eliminatenoise/NeuroSurge
Source ZIP: https://github.com/eliminatenoise/NeuroSurge/archive/refs/heads/main.zip

SHA256SUMS lists the five launcher/instruction files. It can detect changed
files against that list; it does not establish who supplied the list or grant
OS trust or scientific validation. No credentials or private paths are included.
