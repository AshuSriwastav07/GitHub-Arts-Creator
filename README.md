# 🎨 GitHub Avatar Art — Turn Your GitHub Avatar Into Code Art

[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)]()
[![Next.js](https://img.shields.io/badge/built%20with-Next.js%2015-black.svg)]()
[![TypeScript](https://img.shields.io/badge/language-TypeScript-blue.svg)]()
[![License](https://img.shields.io/badge/license-MIT-purple.svg)]()

> A developer identity tool that fetches any public GitHub profile avatar and transforms it into stunning, algorithmic code art for your GitHub profile README.

No login or OAuth required. **100% Deterministic** — the same profile + style + params + seed always yields the exact same byte-identical artwork and permanent URL.

---

## ✨ Features

- 🚀 **Zero Authentication**: Generate art for any public GitHub profile by simply entering a username or profile URL.
- 🎯 **Deterministic & Reproducible**: Powered by canonical JSON param serialization and SHA-1 identity hashing.
- ⚡ **Pure Algorithmic Image Pipeline**: Built on top of `sharp` and hand-crafted algorithms — producing ultra-compact, crisp vector SVGs and PNGs.
- 📋 **README-Ready Embeds**: One-click copy for centered markdown, plain markdown, or raw text blocks.
- 💾 **Flexible Storage**: Native support for **Vercel Blob** in production and deterministic **Local File Storage** in development.
- 🛡️ **Rate Limit & Error Resilient**: Server-side caching for GitHub API responses and friendly developer error boundaries.

---

## 🎭 Curated Art Styles

| Style | Family | Format | Description |
| :--- | :--- | :--- | :--- |
| **Halftone** | Dot / Halftone | SVG | Variable-radius dots sized by brightness. Supports sampled color, monochrome ink, circles, squares, and stippling. |
| **Low Poly** | Geometric | SVG | Delaunay triangulation with edge-adaptive refinement along facial features. |
| **Line Art** | Vector / Line | SVG | Sobel edge skeletonization into vector paths with **Classic**, **Blueprint**, and **Circuit** presets. |
| **Pixel Art** | Pixel | SVG / PNG | Crisp retro block downsampling with optional color palette quantization. |
| **Hex Mosaic** | Mosaic | SVG | Honeycomb polygon tiling with adjustable gap and orientation. |
| **Character Mosaic** | Text / Glyph | Text / SVG | Luminance-to-character mapping featuring **Braille**, **Code** (TypeScript, Python, Rust, Go, JS), **Unicode Blocks**, **Binary**, **Hex**, and **Username** portraits. |
| **Contribution Heatmap** | GitHub-Native | SVG | Renders your portrait using the iconic GitHub contribution calendar 5-level green scale. |

---

## 🛠️ Architecture & Pipeline

```
GitHub Profile URL
  │
  ▼
[ 1. Validate & Parse Username ]
  │
  ▼
[ 2. Fetch Profile & Avatar (Cached) ]
  │
  ▼
[ 3. Shared Image Analysis Pipeline ]
  ├─ Normalize orientation & Center-crop (Square)
  ├─ Compute Luminance Map (0..1)
  ├─ Quantize Dominant Color Palette (Median-cut)
  └─ Extract Sobel Gradient Magnitude (Edge map)
  │
  ▼
[ 4. Style Generator Execution ]
  │
  ▼
[ 5. Deterministic Hash & Storage ]
  │ (sha1(username + avatarUrl + styleId + params + seed))
  ▼
[ 6. Permanent URL + Markdown Embed ]
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18.17+ (or v20+)
- **npm** or **pnpm** / **yarn**

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/AshuSriwastav07/GitHub-Arts-Creator.git
   cd GitHub-Arts-Creator
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

   | Variable | Required | Description |
   | :--- | :--- | :--- |
   | `GITHUB_TOKEN` | *Optional* | GitHub Personal Access Token to raise rate limits (5,000 req/hr vs 60 req/hr). |
   | `BLOB_READ_WRITE_TOKEN` | *Optional* | Vercel Blob read/write token for cloud storage (defaults to local `.data/` directory if omitted). |
   | `BASE_URL` | *Optional* | Canonical URL for absolute README embed links (e.g. `https://your-domain.vercel.app`). |
   | `DATA_DIR` | *Optional* | Directory for local file storage (default: `.data`). |

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing

Run the full Vitest test suite covering username parsing, image analysis, style determinism, and identity hashing:

```bash
npm test
```

---

## 📡 API Reference

### 1. `POST /api/generate`
Fetches a user profile and generates thumbnail previews for all available styles.

- **Request Body:**
  ```json
  { "input": "octocat" }
  ```
- **Response:**
  ```json
  {
    "profile": {
      "username": "octocat",
      "displayName": "The Octocat",
      "avatarUrl": "https://avatars.githubusercontent.com/u/583231?v=4",
      "bio": "",
      "htmlUrl": "https://github.com/octocat"
    },
    "previews": [ ... ]
  }
  ```

### 2. `POST /api/render`
Renders full-resolution artwork for a specific style, parameters, and seed.

- **Request Body:**
  ```json
  {
    "username": "octocat",
    "styleId": "pixelart",
    "params": { "cols": 64, "paletteSize": 0 },
    "seed": 42,
    "format": "svg"
  }
  ```
- **Response:**
  ```json
  {
    "hash": "40-char-sha1-hash",
    "url": "/api/avatar/40-char-sha1-hash.svg",
    "markdown": {
      "centered": "<p align=\"center\"><img src=\"...\" width=\"400\" /></p>",
      "plain": "![octocat avatar art](...)"
    }
  }
  ```

### 3. `GET /api/avatar/:hash.:ext`
Serves stored artifacts permanently with unauthenticated public access and long-term cache headers (`Cache-Control: public, max-age=31536000, immutable`).

---

## 📦 Deployment to Vercel

1. Push your repository to GitHub.
2. Import the project into [Vercel](https://vercel.com).
3. In the Vercel Dashboard, go to **Storage** and create a **Blob Store** (connect it to your project).
4. `BLOB_READ_WRITE_TOKEN` will be automatically injected into your deployment environments.
5. Deploy!

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
