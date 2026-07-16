# Screen Studio parity roadmap

This roadmap is based on Screen Studio's public product and guide pages. It is
an implementation checklist, not a claim of affiliation or pixel-for-pixel
copying.

## Current coverage

| Area | Recordly status | Next fidelity work |
| --- | --- | --- |
| Click auto zoom, manual zoom, zoom depth and animation | Available | Per-region instant animation and disable toggle |
| Smooth cursor, cursor themes, click effects | Available | Per-clip hiding, raw-pointer mode and hide-on-idle are available; next is shake removal |
| Background, padding, crop, aspect ratio, device frames | Available | More bundled glass/wallpaper presets |
| Trim, clips, speed regions, audio gain/normalization | Available | Smart Typing now detects private key timestamps and suggests 2× regions |
| Sensitive-data masks and focus highlights | Available | Dedicated mask lane, shortcut 4, opacity and disable controls |
| Webcam crop, mirror, 9 positions, custom placement | Available | Dynamic fullscreen/default/hidden camera layouts are available |
| Captions and transcript editing | Available | Local model picker/prompt UX parity |
| RNNoise voice cleanup | Available | Editor-side per-track cleanup preview/toggle |
| H.264, HEVC and GIF export | Available | Batch export and quick-share widget |
| Presets, keyboard shortcuts and Command Menu | Available | ⌘K/Ctrl+K exposes editing, timeline, view and project actions; next is portable presets |

## Major remaining feature groups

1. Smart editing: cursor shake removal and command menu access outside the editor.
2. Audio workflow: bundled background music library and per-track AI cleanup controls.
3. Capture workflow: speaker notes/teleprompter, iPhone mirroring and recovery diagnostics.
4. Sharing workflow: quick export, batch export, shareable links and comments.
5. Project portability: shareable presets, raw-track extraction and stronger autosave recovery.

Sources: <https://screen.studio/guide>,
<https://preview.screen.studio/guide/command-menu>,
<https://screen.studio/guide/dynamic-camera-layouts->,
<https://screen.studio/changelog>.
