# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

block_cipher = None


hiddenimports = []
# Ensure the backend package is included (uvicorn dynamic import pitfalls).
hiddenimports += collect_submodules("backend")
# Geo stack sometimes needs explicit collection.
hiddenimports += collect_submodules("geopandas")
hiddenimports += collect_submodules("shapely")

a = Analysis(
    ["maple_launcher.py"],
    # `__file__` is not guaranteed to be defined when PyInstaller executes the spec.
    # Assume the build is invoked from the repo root.
    pathex=[str(Path.cwd())],
    binaries=[],
    datas=[
        ("frontend/static", "frontend/static"),
    ],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # Keep the bundle minimal and avoid optional plotting stacks that
    # may be present in the build environment (e.g. conda base) and
    # trigger missing-dylib errors during hook execution.
    excludes=[
        "matplotlib",
        "matplotlib.pyplot",
        "PIL",
        "PIL.Image",
        "Pillow",
        "IPython",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    [],
    name="MAPLE",
    exclude_binaries=True,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    # NOTE: On newer macOS versions, the windowed bootloader (console=False)
    # may abort during application registration (TransformProcessType).
    # Use console bootloader for stability; the launcher still opens the browser UI.
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="MAPLE",
)

app = BUNDLE(
    coll,
    name="MAPLE.app",
    icon=None,
    bundle_identifier="org.maple.localphylogeo",
)
