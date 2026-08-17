# BestCut

In-browser video editor. Phone-first. Bytes never leave the tab.

Live: https://asherweisberger.github.io/bestcut/

Made by [Asher Weisberger](https://x.com/AsherWeisberger) ([@AsherWeisberger](https://x.com/AsherWeisberger))

MIT. Original implementation. Vite + React + TypeScript. Canvas 2D + WebCodecs + Mediabunny.

## Why

CapCut paywalls basics. OpenCut still ships a backend classic and blocks phones. BestCut is static, local, phone-first. Original UI.

## Features
- Import from disk (camera roll). No upload.
- Timeline: video, overlay, audio, captions.
- Split, trim, snap, undo, ripple, kinetic titles, in-tab auto captions (Whisper-tiny) plus SRT.
- Speed 0.5×–10× on a whole clip, or a marked In/Out stretch (splits, shortens, ripples). Preview and export share one renderer.
- Platform tabs: TikTok, YouTube, Instagram, Facebook, LinkedIn. Canvas aspect and export preset match the tab (YouTube Short, Instagram Feed 4:5, and the rest). Preview equals export.
- Overlay titles that bake into the file. The FX bin is on a fresh project: Kinetic, Reveals, Particles, Background, Gallery, Interactive, Buttons — the full visual catalog, tap to drop on Overlay. Preview plays the live effect; export rasterizes the same overlay into the MP4.
- Export 1080p 30fps MP4 and WebM. Preview equals export.
- IndexedDB + project JSON download.

## Stack
Vite + React + TypeScript. Canvas 2D. WebCodecs + Mediabunny. Zustand. Dexie. ffmpeg.wasm is not bundled.

## Develop

## License

MIT. Copyright 2026 Asher Weisberger ([@AsherWeisberger](https://x.com/AsherWeisberger)).
