# DaggerCraft Toolbox

DaggerCraft Toolbox is a fast, offline-first collection of tools for tabletop DMs. It includes generators and lexicons, an encounter tool, a monster vault, a statblock importer, a map measurer, a dice roller, a text cleaner, and Hex Stocker.

The same frontend supports two editions:

- **Windows desktop app:** a lightweight Tauri app with durable local autosave and recovery backups.
- **GitHub Pages:** the browser edition, with browser storage and optional Supabase cloud save.

## Download the Windows app

Download the newest `DaggerCraft Toolbox_*_x64-setup.exe` from the repository's **Releases** page and run it. The installer is per-user, so it does not need administrator access in the normal case.

The Windows app works without an account or internet connection after installation. Windows 10 version 1803 and newer normally already include the WebView2 component it uses. The installer includes Microsoft's small WebView2 bootstrapper for systems where it is missing.

## How desktop saves work

Every generator, lexicon, tool state, imported monster, and future local-storage-based tool is automatically copied to:

```text
Documents\DaggerCraft Toolbox\daggercraft-data.json
```

No Save button is required. The app also maintains:

- `daggercraft-data.previous.json`, the complete save from immediately before the newest write;
- a `Backups` folder with a snapshot when the app starts and timed recovery snapshots while it is used;
- up to 20 rotating backup files;
- recovery from a valid pending save, previous save, or newest backup when the main file is unreadable.

Use **Open data folder** to inspect the files or **Back up now** to create an immediate snapshot. App updates never replace the Documents data folder.

## One-time migration from the browser edition

Anything currently saved only in a browser must be moved once:

1. Open the GitHub Pages edition in the browser that has your current data.
2. Select **Download database**.
3. Open the Windows app and select **Upload database**.

After that one-time import, desktop changes save automatically to the local data file and backups.

## Run or build locally

Windows development requires Node.js, Rust, Microsoft C++ Build Tools, and WebView2.

```powershell
npm install
npm run desktop:dev
```

Build the public Windows installer with:

```powershell
npm run desktop:build
```

The installer is written under `src-tauri\target\release\bundle\nsis`.

## Publish a release

The GitHub workflow builds on demand from the Actions page. Pushing a version tag also creates a GitHub Release containing the Windows installer:

```powershell
git tag v1.0.0
git push origin v1.0.0
```

Update the matching version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` before publishing a new version.

Public unsigned installers can trigger a Windows SmartScreen reputation warning. A future Authenticode certificate can be added to the release workflow without changing the app or its local data format.
