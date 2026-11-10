#!/bin/sh
# Per-user URL launcher only. No downloads, browser launch or global changes.
set -eu
if [ "$#" -ne 0 ]; then
  printf '%s\n' 'Run this installer without arguments.' >&2
  exit 2
fi
app_data_dir=${XDG_DATA_HOME:-${HOME:?HOME is required when XDG_DATA_HOME is unset}/.local/share}
case "$app_data_dir" in
  /*) ;;
  *) printf '%s\n' 'XDG_DATA_HOME must be an absolute path.' >&2; exit 1 ;;
esac
applications_dir=$app_data_dir/applications
destination=$applications_dir/brain2body-neurosurge.desktop
if command -v omarchy >/dev/null 2>&1 && command -v omarchy-launch-webapp >/dev/null 2>&1; then
  launcher_exec='omarchy launch webapp'
  launcher_tryexec='omarchy'
elif command -v xdg-open >/dev/null 2>&1; then
  launcher_exec='xdg-open'
  launcher_tryexec='xdg-open'
else
  printf '%s\n' 'No desktop URL opener was found. Open https://neurosurge-public-preview-20261110.tr1-set.chatgpt.site/scene/example/preview.html in your browser.' >&2
  exit 1
fi
if [ -L "$applications_dir" ] || { [ -e "$applications_dir" ] && [ ! -d "$applications_dir" ]; }; then
  printf '%s\n' 'The applications destination is not a regular directory; nothing was installed.' >&2
  exit 1
fi
mkdir -p -- "$applications_dir"
# This lock serializes cooperating copies of this installer. It does not lock editors.
lock_dir=$applications_dir/.brain2body-neurosurge.install.lock
if ! mkdir -- "$lock_dir" 2>/dev/null; then
  printf '%s\n' 'Another installer may be running. Nothing was replaced.' >&2
  exit 1
fi
work_dir=
cleanup() {
  if [ -n "$work_dir" ]; then
    rm -f -- "$work_dir/new.desktop" "$work_dir/old-xdg.desktop" "$work_dir/old-omarchy.desktop"
    rmdir -- "$work_dir" 2>/dev/null || :
  fi
  rmdir -- "$lock_dir" 2>/dev/null || :
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
work_dir=$(mktemp -d "$applications_dir/.brain2body-neurosurge.XXXXXXXX")
cat > "$work_dir/new.desktop" <<_NEUROSURGE_CURRENT_
[Desktop Entry]
Version=1.0
Type=Application
Name=NeuroSurge (Experimental Preview)
Comment=Open the experimental browser game
Exec=$launcher_exec https://neurosurge-public-preview-20261110.tr1-set.chatgpt.site/scene/example/preview.html
TryExec=$launcher_tryexec
Icon=web-browser
Terminal=false
Categories=Game;Education;
StartupNotify=true
X-Brain2Body-Launcher=neurosurge-web-preview-v1
_NEUROSURGE_CURRENT_
chmod 0644 "$work_dir/new.desktop"
# These complete, exact old project templates are the only upgrade allowlist.
# A marker, a matching URL, or a similar-looking file is insufficient.
cat > "$work_dir/old-xdg.desktop" <<'_NEUROSURGE_OLD_XDG_'
[Desktop Entry]
Version=1.0
Type=Application
Name=NeuroSurge (Experimental Preview)
Comment=Open the experimental browser game
Exec=xdg-open https://eliminatenoise.github.io/NeuroSurge/
TryExec=xdg-open
Icon=web-browser
Terminal=false
Categories=Game;Education;
StartupNotify=true
X-Brain2Body-Launcher=neurosurge-web-preview-v1
_NEUROSURGE_OLD_XDG_
cat > "$work_dir/old-omarchy.desktop" <<'_NEUROSURGE_OLD_OMARCHY_'
[Desktop Entry]
Version=1.0
Type=Application
Name=NeuroSurge (Experimental Preview)
Comment=Open the experimental browser game
Exec=omarchy launch webapp https://eliminatenoise.github.io/NeuroSurge/
TryExec=omarchy
Icon=web-browser
Terminal=false
Categories=Game;Education;
StartupNotify=true
X-Brain2Body-Launcher=neurosurge-web-preview-v1
_NEUROSURGE_OLD_OMARCHY_
if [ -e "$destination" ] || [ -L "$destination" ]; then
  if [ -L "$destination" ] || [ ! -f "$destination" ]; then
    printf 'Existing destination preserved: %s\n' "$destination" >&2
    printf '%s\n' 'A symlink or non-regular file uses this name. Nothing was replaced.' >&2
    exit 1
  fi
  if cmp -s "$work_dir/new.desktop" "$destination"; then
    printf 'Already installed: %s\n' "$destination"
    exit 0
  fi
  if ! cmp -s "$work_dir/old-xdg.desktop" "$destination" && ! cmp -s "$work_dir/old-omarchy.desktop" "$destination"; then
    printf 'Existing file preserved: %s\n' "$destination" >&2
    printf '%s\n' 'This is not an exact older NeuroSurge launcher. Nothing was replaced.' >&2
    exit 1
  fi
  backup=$(mktemp "$applications_dir/brain2body-neurosurge.desktop.backup.XXXXXXXX")
  cp -p -- "$destination" "$backup"
  # Recheck after backup; an external writer can still race the following rename.
  if [ -L "$destination" ] || [ ! -f "$destination" ] || ! cmp -s "$backup" "$destination"; then
    printf 'The destination changed; nothing was replaced. Backup: %s\n' "$backup" >&2
    exit 1
  fi
  if ! cmp -s "$work_dir/old-xdg.desktop" "$backup" && ! cmp -s "$work_dir/old-omarchy.desktop" "$backup"; then
    printf 'The backup differs from the known older templates; nothing was replaced. Backup: %s\n' "$backup" >&2
    exit 1
  fi
  mv -T -- "$work_dir/new.desktop" "$destination"
  printf 'Updated: %s\n' "$destination"
  printf 'Previous launcher saved: %s\n' "$backup"
else
  # -T treats destination as one file. Link creation never replaces an existing path.
  if ! ln -T -- "$work_dir/new.desktop" "$destination"; then
    printf '%s\n' 'The destination appeared or could not be created; nothing was replaced.' >&2
    exit 1
  fi
  printf 'Installed: %s\n' "$destination"
fi
printf '%s\n' 'Open your application menu and search for NeuroSurge (Experimental Preview).'
