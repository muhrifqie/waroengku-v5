<div align="center">

# Waroengku V5

**Automation suite desktop untuk pembuatan, langganan & manajemen akun massal**
CapCut (ID/VN) · Canva · Outlook — dengan browser anti-deteksi, manajemen proxy, Auto Payment (MoMo QR), dan integrasi penyedia OTP/Captcha.

Dibangun dengan **Electron · Vite · React · TailwindCSS** — antarmuka bertema hangat ala Claude (font Anthropic, palet terracotta, light/dark).

</div>

---

## ✨ Fitur

- **CapCut Creator (ID & VN)** — daftar akun CapCut otomatis via **Camoufox** (Firefox anti-fingerprint). OTP email dari berbagai penyedia, isi form human-like, simpan sesi login, dan **restore sesi** kapan saja.
  - Mode **VN nonstop**: 1 proxy = 1 akun, jalan sampai proxy habis. Proxy VN ditarik otomatis dari halaman **Proxy**, dicek hidup/mati dulu, lalu **paralel diatur manual** (default = jumlah proxy).
  - **Random Domain**: tiap akun memakai domain email acak dari semua domain yang tersedia di penyedia.
- **Auto Payment (CapCut Pro · MoMo QR)** — buka link Pipopay → pilih MoMo → **QR di-mirror ke aplikasi** untuk di-scan admin. QR dicek tiap 1 detik; begitu hilang dari halaman (di-scan), kartu otomatis hilang dan hasil (**Berhasil / Gagal / Kedaluwarsa**) muncul di bawah. Ada **Bayar (terpilih)** & **Bayar Semua** (mulai dari akun terlama).
  - **Berjalan independen dari Creator** — auto-payment bisa jalan berbarengan selagi auto-create berlangsung; Stop tiap proses terpisah.
- **Canva Creator** — daftar akun Canva via email Litensi + verifikasi kode + set password.
- **Outlook Creator** — daftar akun Outlook di **profil AdsPower** baru (fingerprint acak). Alur `signup.live.com` human-like; captcha "Press & Hold" diselesaikan manual (notifikasi suara + window flash).
- **Manajemen Akun (Folder Explorer)** — semua akun di satu database SQLite, dikelompokkan dalam **folder** (buat/edit/hapus). Cari, filter, export CSV, salin, restore.
- **Proxy** — tempel proxy format apa pun (satu input) dengan **deteksi protokol otomatis** (HTTP/HTTPS/SOCKS4/SOCKS5), uji koneksi + exit IP/negara/ISP/latensi. Ambil proxy VN dari **CLIProxy** (cek live dulu, hanya beli kekurangan) atau **DataImpulse**, lalu rotasi otomatis.
- **Integrasi** — kelola API key penyedia dalam satu tempat:
  - *OTP/Email*: Litensi, SMS Virtual, SMSBower, HeroSMS, TMail, Generator.email
  - *Proxy*: CLIProxy, DataImpulse
  - *Captcha*: 2Captcha, CapSolver
  - *Browser*: AdsPower
- **Terminal** — log real-time bergaya konsol: timestamp, tag per-task, warna per-level, filter, pencarian, auto-scroll (log di-batch agar UI tetap ringan saat banyak worker).
- **Dashboard** — info perangkat (CPU/RAM/IP/Machine ID) + **rekomendasi thread** berdasarkan hardware, jam berjalan, dan pintasan tools.
- **Database aman** — lokal di komputer (tahan update), dengan **Export/Backup**, **Restore**, **Compact (VACUUM)**, dan impor DB lama.
- **Auto-update** — via **GitHub Releases** (electron-updater): cek → unduh (progress) → restart & pasang.

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
npm install
npm run dev          # hot-reload
```

Saat pertama dibuka, layar **Setup** memeriksa Node, dependencies, Python/pydeps, dan browser
Camoufox — tombol **Install & Setup** mengunduh Camoufox (± 150 MB) dengan log langsung.

## 📦 Build & Rilis

```bash
npm run build        # bundle ke out/
npm run dist         # + installer NSIS ke dist/
```

Rilis publik (auto-update untuk semua pengguna) dijalankan lewat GitHub Actions:

```bash
npm version patch    # 5.0.2 → 5.0.3 (auto commit + tag)
git push --follow-tags
```

Push tag `v*` memicu workflow yang mem-build installer Windows dan mem-publish ke
**GitHub Releases**. Aplikasi terpasang akan memeriksa & memasang pembaruan otomatis.

> Auto-update hanya aktif pada versi terpasang (installer), bukan `npm run dev`.

## 🗂️ Struktur Proyek

```
src/
├─ main/            Proses utama (Node)
│  ├─ index.js      Window, IPC, run-token per-grup (create/payment), auto-update
│  ├─ db.js         SQLite (akun, folder, proxy, settings)
│  ├─ bot.js        Alur CapCut ID/VN + Canva + Auto Payment (Camoufox)
│  ├─ cliproxy.js   Klien CLIProxy (cek live → bind proxy VN)
│  ├─ outlook.js    Alur signup Outlook + outlookbot.js (orkestrasi AdsPower)
│  ├─ adspower.js   Klien AdsPower (create profile, connect CDP)
│  ├─ otp.js        Penyedia OTP/email (+ mode Random Domain)
│  ├─ captcha.js    Solver captcha (2Captcha/CapSolver)
│  └─ proxy.js      Parse, deteksi & cek hidup/mati proxy
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
