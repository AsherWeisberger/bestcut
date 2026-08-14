# BestCut

In-browser video editor. Phone-first. Bytes never leave the tab.

Live: https://asherweisberger.github.io/bestcut/

MIT. Original implementation. Vite + React + TypeScript. Canvas 2D + WebCodecs + Mediabunny.

## Why

CapCut paywalls basics. OpenCut still ships a backend classic and blocks phones. BestCut is static, local, phone-first. Original UI.

## Features
- Import from disk (camera roll). No upload.
- Timeline: video, overlay, audio, captions.
- Split, trim, snap, undo, ripple, kinetic titles, in-tab auto captions (Whisper-tiny) plus SRT.
- Export 1080p 30fps MP4 and WebM. Preview equals export.
- IndexedDB + project JSON download.

## Stack
Vite + React + TypeScript. Canvas 2D. WebCodecs + Mediabunny. Zustand. Dexie. ffmpeg.wasm is not bundled.

## Develop
