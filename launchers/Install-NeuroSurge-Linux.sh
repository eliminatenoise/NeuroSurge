#!/bin/sh
# Brain2Body per-user URL launcher installer. No download, browser launch, sudo or global configuration.
set -eu
if [ "$#" -ne 0 ]; then
  printf '%s\n' 'Run this installer without arguments.' >&2
  exit 2
fi
app_data_dir=${XDG_DATA_HOME:-${HOME:?HOME is required when XDG_DATA_HOME is unset}/.local/share}
case "$app_data_dir" in /*) ;; *) printf '%s\n' 'XDG_DATA_HOME must be an absolute path.' >&2; exit 1 ;; esac
applications_dir=$app_data_dir/applications
destination=$applications_dir/brain2body-neurosurge.desktop
marker='X-Brain2Body-Launcher=neurosurge-web-preview-v1'
if command -v omarchy >/dev/null 2>&1 && command -v omarchy-launch-webapp >/dev/null 2>&1; then
  launcher_exec='omarchy launch webapp'
  launcher_tryexec='omarchy'
elif command -v xdg-open >/dev/null 2>&1; then
  launcher_exec='xdg-open'
  launcher_tryexec='xdg-open'
else
  printf '%s\n' 'No desktop URL opener was found. Open https://eliminatenoise.github.io/NeuroSurge/ in your browser.' >&2
  exit 1
fi
if [ -L "$applications_dir" ] || { [ -e "$applications_dir" ] && [ ! -d "$applications_dir" ]; }; then
  printf '%s\n' 'The applications destination is not a regular directory; nothing was installed.' >&2
  exit 1
fi
mkdir -p -- "$applications_dir"
temporary=$(mktemp "$applications_dir/.brain2body-neurosurge.XXXXXX")
trap 'rm -f -- "$temporary"' EXIT HUP INT TERM
cat > "$temporary" <<_BRAIN2BODY_DESKTOP_
[Desktop Entry]
Version=1.0
Type=Application
Name=NeuroSurge (Experimental Preview)
Comment=Open the experimental browser game
Exec=$launcher_exec https://eliminatenoise.github.io/NeuroSurge/
TryExec=$launcher_tryexec
Icon=web-browser
Terminal=false
Categories=Game;Education;
StartupNotify=true
$marker
_BRAIN2BODY_DESKTOP_
chmod 0644 "$temporary"
if [ -e "$destination" ] || [ -L "$destination" ]; then
  if [ ! -L "$destination" ] && [ -f "$destination" ] && grep -Fxq "$marker" "$destination" && cmp -s "$temporary" "$destination"; then
    printf 'Already installed: %s\n' "$destination"
    exit 0
  fi
  printf 'Existing file preserved: %s\n' "$destination" >&2
  printf '%s\n' 'A different file already uses this name. Nothing was replaced.' >&2
  exit 1
fi
# -T treats destination as one file. Hard-link creation cannot replace an existing file/symlink/directory.
if ! ln -T -- "$temporary" "$destination"; then
  printf '%s\n' 'The destination appeared or could not be created; nothing was replaced.' >&2
  exit 1
fi
printf 'Installed: %s\n' "$destination"
printf '%s\n' 'Open your application menu and search for NeuroSurge (Experimental Preview).'
