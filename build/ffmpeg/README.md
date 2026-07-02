# Bundled FFmpeg

Platform-specific FFmpeg binaries live here before packaging.

Expected paths:

- `build/ffmpeg/win/ffmpeg.exe`
- `build/ffmpeg/mac/ffmpeg`
- `build/ffmpeg/linux/ffmpeg`

During development the app checks these paths first, then falls back to a system `ffmpeg`.
After packaging, electron-builder copies this directory to `resources/ffmpeg`, so users do not
need to install FFmpeg separately.

Current bundled files:

- mac arm64: `@ffmpeg-installer/darwin-arm64@4.1.5`
  - `build/ffmpeg/mac/ffmpeg`
  - SHA256: `a2ad6f0fc42a3c8f5183ef1d53e906d6bb35478d14a6b67175c30ce6c17e9214`
- Windows x64: `@ffmpeg-installer/win32-x64@4.1.0`
  - `build/ffmpeg/win/ffmpeg.exe`
  - SHA256: `c8abc49e7be62dde8e12972af373959e0076a7b8dc8040eb45978e0608f8781e`

Use an FFmpeg build whose license matches your distribution plan. The current mac build reports
`--enable-gpl` and `--enable-nonfree`; replace it with an LGPL-compatible build before commercial
distribution unless the project is prepared to comply with those license terms.
