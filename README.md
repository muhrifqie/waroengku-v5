<div align="center">

# Waroengku V5

**Automation suite desktop untuk pembuatan & manajemen akun massal**
CapCut · Outlook · dengan browser anti-deteksi, manajemen proxy, dan integrasi penyedia OTP/Captcha.

Dibangun dengan **Electron · Vite · React · TailwindCSS** — antarmuka bertema hangat ala Claude (font Anthropic, palet terracotta, light/dark).

</div>

---

## ✨ Fitur

- **CapCut Creator** — daftar akun CapCut otomatis via **Camoufox** (Firefox anti-fingerprint). OTP email dari berbagai penyedia, isi form human-like, simpan sesi login, dan **restore sesi** kapan saja.
- **Outlook Creator** — daftar akun Outlook di **profil AdsPower** baru (fingerprint acak). Alur `signup.live.com` dengan gerakan mouse/ketikan menyerupai manusia; captcha "Press & Hold" diselesaikan manual (dengan notifikasi suara + window flash).
- **Manajemen Akun (Folder Explorer)** — semua akun tersimpan di satu database SQLite, dikelompokkan dalam **folder** yang bisa dibuat/edit/hapus. Cari, filter, export CSV, salin, dan restore.
- **Proxy** — tempel proxy format apa pun (satu input), **deteksi protokol otomatis** (HTTP/HTTPS/SOCKS4/SOCKS5), uji koneksi + exit IP/negara/ISP/latensi, lalu rotasi otomatis ke tiap tool.
- **Integrasi** — kelola API key penyedia dalam satu tempat:
  - *OTP/Email*: Litensi, SMS Virtual, SMSBower, HeroSMS, TMail, Generator.email
  - *Captcha*: 2Captcha, CapSolver
  - *Browser*: AdsPower
- **Terminal** — halaman log real-time bergaya konsol: timestamp, tag per-task, warna per-level, filter, pencarian, auto-scroll.
- **Dashboard** — info perangkat (CPU/RAM/IP/Machine ID) + **rekomendasi thread** berdasarkan hardware, jam berjalan, dan pintasan tools.
- **Database aman** — tersimpan lokal di komputer (tahan update), dengan **Export/Backup**, **Restore**, **Compact (VACUUM)**, dan impor DB lama.
- **Auto-update** — pembaruan otomatis via **GitHub Releases** (electron-updater): cek → unduh (progress) → restart & pasang.

## 🧱 Teknologi

| Lapisan | Stack |
|---------|-------|
| Shell | Electron 33 · electron-vite · electron-builder |
| UI | React 18 · TailwindCSS 4 · lucide-react |
| Otomasi | Camoufox (playwright-core) · AdsPower CDP |
| Data | SQLite (sql.js / WASM) |
| Update | electron-updater · GitHub Actions |

## 🚀 Menjalankan (development)

```bash
cd electron
npm install
npm run dev          # hot-reload
```

Saat pertama dibuka, layar **Setup** memeriksa Node, dependencies, dan browser
Camoufox — tombol **Install & Setup** mengunduh Camoufox (± 150 MB) dengan log langsung.

## 📦 Build & Rilis

```bash
npm run build        # bundle ke out/
npm run dist         # + installer NSIS ke dist/
```

Rilis publik (auto-update untuk semua pengguna) dijalankan lewat GitHub Actions:

```bash
npm version patch    # 5.0.0 → 5.0.1 (auto commit + tag)
git push --follow-tags
```

Push tag `v*` memicu workflow yang mem-build installer Windows dan mem-publish ke
**GitHub Releases**. Aplikasi terpasang akan memeriksa & memasang pembaruan otomatis.

> Auto-update hanya aktif pada versi terpasang (installer), bukan `npm run dev`.

## 🗂️ Struktur Proyek

```
src/
├─ main/            Proses utama (Node)
│  ├─ index.js      Window, IPC, auto-update
│  ├─ db.js         SQLite (akun, folder, proxy, settings)
│  ├─ bot.js        Alur CapCut (Camoufox)
│  ├─ outlook.js    Alur signup Outlook + outlookbot.js (orkestrasi AdsPower)
│  ├─ adspower.js   Klien AdsPower (create profile, connect CDP)
│  ├─ otp.js        Penyedia OTP/email
│  ├─ captcha.js    Solver captcha (2Captcha/CapSolver)
│  └─ proxy.js      Parse & deteksi cerdas proxy
├─ preload/         Bridge aman window.api (contextIsolation)
└─ renderer/        UI React
   └─ src/{pages, components, store.jsx, providers.js, folders.jsx}
```

## 🔐 Privasi & Data

Seluruh data (akun, cookies sesi, proxy, konfigurasi) disimpan **lokal** di folder
data aplikasi pada komputer pengguna — tidak dikirim ke mana pun. Gunakan
**Pengaturan → Data → Export** untuk mencadangkan, dan **Restore** untuk memulihkan.

## ⚠️ Disclaimer

Perangkat lunak ini ditujukan untuk otomatisasi dan pengujian internal.
Pengguna bertanggung jawab penuh untuk mematuhi Ketentuan Layanan dari setiap
platform pihak ketiga yang diakses.

---

<div align="center">
<sub>© Waroengku V5 — Dev. <b>Muh Rifq</b></sub>
</div>
