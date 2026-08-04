# CapCut Manager — Electron + Vite (UI Claude-style)

Aplikasi desktop untuk daftar akun CapCut otomatis (Camoufox anti-deteksi),
tema hangat ala Claude (font Anthropic Sans/Serif, palette terracotta),
dibangun dengan **electron-vite + React**.

## Jalankan (dev, hot-reload)

```bash
cd electron
npm install
npm run dev
```

## Build

```bash
npm run build     # bundle ke out/
npm run dist      # + electron-builder → installer NSIS (dist/, icon.ico)
```

Saat pertama dibuka, layar **Setup** memeriksa Node, dependencies, dan browser
Camoufox; tombol **Install & Setup** mengunduh Camoufox (± 150 MB) dengan log live,
lalu **Lanjut ke Aplikasi**.

## Struktur (electron-vite)

| Path | Isi |
|------|-----|
| `src/main/index.js` | Proses utama: window frameless, IPC setup (check/install) |
| `src/preload/index.js` | Bridge aman `window.api` (contextIsolation) |
| `src/renderer/` | React: `App.jsx`, `components/`, `styles.css` (tema + font) |
| `src/renderer/src/assets/` | Font Anthropic + icon UI |
| `resources/icon.ico/.png` | Icon window & installer |
| `electron.vite.config.mjs` | Konfigurasi Vite (main/preload/renderer) |

Tema light/dark toggle ◐ di titlebar (tersimpan). Alias `@` → `src/renderer/src`.
