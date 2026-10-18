"""Finder layout shared with Tauri's DMG settings, without Finder automation."""
import json
from pathlib import Path

root = Path.cwd()  # build-dmg.mjs always runs this file from the project root.
tauri = root / "src-tauri"
config = json.loads((tauri / "tauri.conf.json").read_text())
layout = config["bundle"]["macOS"]["dmg"]
app_name = config["productName"] + ".app"
application = tauri / "target" / "release" / "bundle" / "macos" / app_name
if not application.is_dir():
    raise FileNotFoundError(f"Build the application first: {application}")

format = "UDZO"
files = [str(application)]
symlinks = {"Applications": "/Applications"}
hide_extensions = [app_name]
icon = str(tauri / "icons" / "icon.icns")
background = str(tauri / layout["background"])
window_rect = ((200, 200), (layout["windowSize"]["width"], layout["windowSize"]["height"]))
icon_locations = {
    app_name: (layout["appPosition"]["x"], layout["appPosition"]["y"]),
    "Applications": (layout["applicationFolderPosition"]["x"], layout["applicationFolderPosition"]["y"]),
}
default_view = "icon-view"
include_icon_view_settings = True
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
icon_size = 112
text_size = 13
label_pos = "bottom"
