# Story Loom：完整產品、技術、UX、商業與安全 Review

版本：2026-08-31  
狀態：產品藍圖；尚未代表已完成的產品功能

## 0. Executive summary

Story Loom 應該被定位為：

> 把照片和微小的動態時刻，編成一個你隨時可以走回去的安靜章節。

它不是普通相簿、不是 AI 相片分析器，也不是單純的 3D demo。核心體驗是讓使用者把一段旅行、生活階段、戀愛、寵物、創作或家庭回憶放進一個可反覆回訪的空間。

最終建議：

- 圖片接受 PNG、WebP、GIF；每張最多 5MB。
- MP4 可以上傳，但作為少量的「動態記憶卡」，不是影片倉庫。
- 每章 Memory 層最多 60 張圖片、3 個 MP4。
- AI 預設不自動呼叫；使用者主動整理章節時才呼叫。
- 3D 展廳採用參考作品的空間感、牆面、陰影、lazy loading 和 culling。
- 不採用大型隨機迷宮作為唯一 viewer。
- Quiet View 是預設；Walk View 是可選的沉浸模式。
- Cloudflare Worker + TanStack Start + D1 + R2 + PWA 可以支援整個產品。
- 使用者資料、圖片和影片必須在 server side 做 authorization；不能只依靠前端路由。

## 1. 目前 repository 的已驗證狀態

目前 `/Users/nosensetxt/mvp/story-loom` 是一個剛初始化的 TanStack Start / Cloudflare Vite scaffold，不是已經實作的 Story Loom。

已驗證：

- [`package.json`](/Users/nosensetxt/mvp/story-loom/package.json) 第 2 行仍是 `my-tanstack-start-app`。
- [`wrangler.jsonc`](/Users/nosensetxt/mvp/story-loom/wrangler.jsonc) 第 7 行仍是 `my-tanstack-start-app`。
- `wrangler.jsonc` 沒有 D1 binding。
- `wrangler.jsonc` 沒有 R2 binding。
- 沒有 auth、session、payment、subscription、AI、upload 或 PWA code。
- [`src/routes/index.tsx`](/Users/nosensetxt/mvp/story-loom/src/routes/index.tsx) 仍是 generic starter page。
- [`src/routes/__root.tsx`](/Users/nosensetxt/mvp/story-loom/src/routes/__root.tsx) 仍載入 TanStack devtools 和 starter theme script。
- `package.json` 已有 TanStack Start、React、Vite、Cloudflare Vite plugin、Wrangler，因此可以作為產品骨架。

目前不能聲稱已完成：

- D1 schema
- R2 private media delivery
- username/password auth
- HttpOnly session cookie
- authorization wall
- AI pipeline
- 3D chapter viewer
- MP4 processing
- Stripe payment
- PWA installability
- Brave compatibility

## 2. 參考 3D gallery 的結論

參考網站：[3D Art Gallery](https://25920.github.io/threed-art-gallery/)  
參考 repo：[25920/threed-art-gallery](https://github.com/25920/threed-art-gallery)

Google Chrome 實際看到：

- 灰白色展廳。
- 反光地板。
- 多面牆壁。
- 圖片掛在牆面。
- 圖片下面有標題。
- 按 `W` 後相機向前移動。
- 沒有明顯的操作提示、入口、返回按鈕或章節導航。
- 主要內容由 WebGL canvas 畫出，DOM 幾乎沒有語意內容。

GitHub source 顯示的技術設計：

- `src/index.js` 使用 `regl` 建立 WebGL render loop。
- `src/fps.js` 處理 WASD、touch 和 pointer lock camera。
- `src/map.js` 程序式生成大型迷宮／展廳牆面。
- `src/placement.js` 根據距離和視野載入、卸載、cull 圖片。
- `src/image.js` 依網絡狀況選擇低／高解析度 texture。
- `src/painting.js` 生成圖片厚度、陰影和反射感。
- `src/text.js` 將標題畫成 texture。
- `api/local.js` 和 `images/generateList.js` 依靠本地檔名清單。

參考作品的 MIT license：[LICENSE](https://github.com/25920/threed-art-gallery/blob/master/LICENSE)。可以研究或重用部分程式，但必須保留授權聲明，並重新設計資料層和使用者流程。

### Story Loom 應保留

- 圖片掛在牆上。
- 柔和空間深度。
- 陰影、厚度和微弱反射。
- 走入章節的感覺。
- 只載入附近資產。
- 根據視野做 rendering culling。
- 觸控瀏覽。

### Story Loom 不應直接照搬

- 隨機大型迷宮。
- 必須使用 pointer lock。
- 沒有返回入口。
- 沒有進度和圖片索引。
- 只依靠 WebGL、沒有 2D fallback。
- 用檔名加 JSON 當作使用者資料庫。

## 3. 產品定位與情緒方向

### 產品名稱

產品暫名：Story Loom。

產品主句：

> Your life, somewhere you can walk back into.

中文：

> 你的生活，一個可以走回去的地方。

### 視覺方向：午夜記憶室

| 用途 | 顏色 | Hex |
|---|---|---|
| 夜間背景 | 午夜藍黑 | `#111827` |
| 第二背景 | 深靛紫 | `#1E1B35` |
| 卡片／紙張 | 舊奶油 | `#F4EBDD` |
| 主文字 | 深咖啡 | `#352A25` |
| 柔和焦點 | 蜜杏 | `#D99A6C` |
| 高光 | 暮金 | `#E9C46A` |
| 安撫色 | 灰鼠尾草 | `#8FA79A` |
| 情緒色 | 玫瑰銅 | `#B96A67` |
| 未來感 | 褪色天空藍 | `#91B7C7` |

設計原則：

- 動畫像呼吸，不像遊戲特效。
- 不用大量霓虹、AI 紫光或 dashboard 感。
- 不用 streak、排行榜或強迫每日回訪。
- 回訪應該是因為舒服，而不是因為害怕錯過。
- 所有章節預設 private。

## 4. Media specification

### 圖片

接受：

- PNG
- WebP
- GIF，包括 animated GIF

拒絕：

- JPG / JPEG
- SVG
- AVIF
- HEIC
- 其他格式

限制：


- 每張最大 5MB。
- 最大寬度 8,192px。
- 最大高度 8,192px。
- 最大總像素 40MP。
- GIF 最多 60 幀。
- GIF 最長 8 秒。
- 單次最多選 20 張。

前端 `<input accept>` 只提供 UX；Worker 必須重新檢查 magic bytes、MIME、實際尺寸、解碼後像素和動畫幀數。

### MP4

答案是：允許，但從產品定位上限制它。

建議：

- 只允許 `video/mp4`。
- 每段最多 20MB。
- 最長 30 秒。
- 最多 1280×720。
- Free 每章 1 段。
- Memory 每章 3 段。
- Studio 每章 8 段。
- 點擊後才播放。
- 不自動播放聲音。
- 不在 MVP 對影片做 vision analysis。

MP4 在章節中先變成「動態記憶卡」：顯示 poster、短暫呼吸動畫和 play icon。使用者點擊後才播放 `VideoTexture` 或普通 HTML video。

不要把 MP4 和圖片共用 5MB 上限。短手機影片很容易超過 5MB，否則上傳體驗會變差。

R2 支援小型檔案單次 PUT 和較大檔案 multipart upload；MP4 可以使用 signed direct upload，不必把完整影片穿過 Worker。[R2 upload 文件](https://developers.cloudflare.com/r2/objects/upload-objects/)

## 5. Chapter quota

不要把用戶鎖在第 25 張照片之後。那會讓 Fountain 變成 Tap。

| 套餐 | 圖片／章 | MP4／章 | 章節數 |
|---|---:|---:|---:|
| Free | 12 | 1 | 1 |
| Memory | 60 | 3 | 12 |
| Studio | 120 | 8 | 50 |

訂閱失效後：

- 已有章節仍可閱讀。
- 已有分享連結不應突然失效，除非用戶主動撤銷。
- 不能新增超出配額的資產。
- 不能使用高解析度 export 或新增 premium effect。
- 不刪除既有資料。

## 6. Privacy-first metadata pipeline

圖片和影片預設要自動清洗 metadata。

可能存在的資料：

- GPS。
- 拍攝時間。
- 裝置型號。
- 相機資訊。
- 編輯軟體。
- IPTC、XMP 和 EXIF。

ICO 也提醒圖片 EXIF 可能包含 GPS、日期和時間等個人資料。[ICO 指引](https://ico.org.uk/media2/pbwchh24/disclosing-documents-to-the-public-securely-all-1-0-0.pdf)

處理規則：

1. 上傳到 private quarantine key。
2. 驗證格式和實際內容。
3. 重新解碼和編碼。
4. 移除 GPS、EXIF、XMP、IPTC 和裝置資訊。
5. 產生 thumbnail、display 和 poster。
6. 只有清洗後的 object 進入正常章節。
7. 原始檔不以原檔名公開。

Cloudflare Image Transformations 也提供 `metadata=none` 類似的 metadata 移除策略；應用層仍要自己做輸入驗證。[Cloudflare metadata 文件](https://developers.cloudflare.com/images/optimization/features/)

給使用者的文案：

> We remove hidden location and device data before your memory enters the Loom.

## 7. AI policy and cost control

### 不應呼叫 AI 的時機

- 每次單張上傳。
- 每次打開章節。
- 每次拖動圖片。
- 每次選擇顏色。
- 每次改標題。
- 每次播放 MP4。
- 每次 3D camera 移動。

### 應呼叫 AI 的時機

使用者主動按：

> Help this chapter find its feeling

一次最多分析整批新增圖片。不要每張圖片一個 request。

建議頻率：

- 新章節建立：最多 1 次 vision call。
- 新增一批圖片：使用者按 settle 後最多 1 次 vision call。
- 修改文字語氣：1 次 text-only call。
- 生成旁白：每章每個版本最多 1 次。
- 同一批圖片反覆生成：使用 checksum 和 prompt hash cache。

DeepSeek V4 Flash Vision 目前每張圖片上限約 384 image tokens，實際 usage 要以 API 回傳為準。[DeepSeek Vision](https://api-docs.deepseek.com/guides/vision/)

目前官方定價頁列出的 vision input cache miss 非高峰價格約為 `$0.22 / 1M tokens`，output 約為 `$0.66 / 1M tokens`，高峰時段約兩倍。[DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/)

粗略估算：

| 分析量 | 大約 input | output | 非高峰約成本 |
|---|---:|---:|---:|
| 8 張圖 | 3,500 | 300 | `$0.001` |
| 25 張圖 | 10,100 | 400 | `$0.0025` |
| 60 張圖 | 23,500 | 500 | `$0.0055` |

5000 名使用者、每人一章、平均 25 張、每章分析一次，vision model 估算約 `$12–25`，取決於時段和實際 usage；這不包括重試、R2、圖片處理、影片轉碼、其他模型和流量。

產品層應限制：

- 每章每版本最多一次 vision generation。
- Free 每月最多 3 次。
- Memory 每月最多 30 次。
- Studio 每月最多 150 次。
- 所有 AI request 記錄 `provider`, `model`, `input_tokens`, `output_tokens`, `cost_usd`, `chapter_id`。
- AI 失敗不扣除使用者的產品配額。

### AI 的呈現方式

不要寫：

> AI is analyzing your life.

改寫成：

- Help this chapter find its feeling.
- Give this memory a gentle beginning.
- Quietly arrange my chapter.
- Find the warmth in these moments.

AI 只產生建議，不能聲稱使用者真的說過一段 AI 生成的話。

## 8. UX from start to finish

### First visit

1. Landing page 展示一個可互動 sample chapter。
2. User 可以不登入觀看 sample。
3. 按 `Make a chapter`。
4. 先選圖片並在瀏覽器本地預覽。
5. 真正上傳前才要求登入或註冊。
6. 顯示 privacy cleaning 說明。
7. User 選章節名稱和 mood。
8. 直接建立 Quiet View。
9. 可選 `Walk through` 進入 3D。

### Upload 8 images

8 張圖片不應只變成 grid，也不應立即變成長篇 AI 小說。

最終結果：

- 1 個章節封面。
- 8 個 memory nodes。
- 1 條固定、可返回的路線。
- 1 個可選短句。
- 可選 AI title、caption 和 mood。
- 可選 1–3 個 MP4 動態節點。

### Update chapter

1. 開啟章節。
2. 按 `Add a moment`。
3. 選圖或 MP4。
4. 顯示格式、大小和 metadata cleaning 狀態。
5. 系統將資產放到 pending state。
6. 顯示 `Finding a place for this moment…`。
7. 以 deterministic layout 放到場景。
8. 使用者可選 mood。
9. 按 `Let it settle` 保存新版本。
10. AI 整理是可選，不是阻塞步驟。

### Chapter viewing

Quiet View：

- Swipe 或 drag。
- 一次聚焦一個記憶。
- 點擊放大。
- 顯示章節進度。
- 可跳到任何 node。
- 可關閉 motion。

Walk View：

- Desktop 支援 WASD 和滑鼠拖動。
- Mobile 支援 swipe、drag 和 auto-walk。
- 有回到入口。
- 有下一個 memory。
- 不強制 pointer lock。
- 有 2D fallback。

Focus View：

- 單張圖片或 MP4。
- 顯示短句、筆記、日期（只有使用者提供或同意）。
- 影片點擊後播放。
- 適合只想回看一個片段的時候。

## 9. From barebone TanStack to functional product

### Phase 0：清理 scaffold

- 將 package name 和 Worker name 從 `my-tanstack-start-app` 改為 `story-loom`。
- 替換 starter header、footer、title 和 about page。
- 移除 production build 的 TanStack devtools。
- 不公開 source maps，或只送到受保護的 error reporting service。
- 保留 `pnpm dev`、`pnpm build`、`pnpm deploy`、`pnpm cf-typegen`。

### Phase 1：資料和 binding

Wrangler 會增加：

```jsonc
{
  "d1_databases": [{
    "binding": "DB",
    "database_name": "story-loom-db",
    "database_id": "..."
  }],
  "r2_buckets": [{
    "binding": "MEDIA",
    "bucket_name": "story-loom-media"
  }]
}
```

使用 `wrangler d1 migrations` 管理 schema，不直接在 production 手動改表。

### Phase 2：TanStack route 和 server functions

建議 routes：

```text
/                         marketing/sample
/login                    auth
/register                 auth
/app                      chapter list
/app/chapters/new         create flow
/app/chapters/$chapterId  editor + viewer
/share/$shareToken        public/unlisted viewer
/settings/privacy         privacy and delete controls
/settings/billing         subscription and receipt
```

TanStack loader 負責取得頁面資料；TanStack server functions 或 route handlers 負責 mutation。所有 mutation 在 Worker side 重新驗證 session、ownership、quota 和 payload。

### Phase 3：Auth

建議：

- username + password 起步。
- email 可作 recovery，但不是公開 username。
- password 只保存強 hash，不保存明文。
- server-side session record。
- cookie 使用 opaque random session ID。
- cookie：`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`。
- production 使用 `__Host-storyloom_session`。
- logout/revoke/delete account 時撤銷 session。

不要把 session token 放在 localStorage。不要把 AI key、Stripe secret 或 R2 credentials 放進 Vite client bundle。

### Phase 4：Upload pipeline

```text
Browser selects file
        ↓
Worker checks session + quota + declared size
        ↓
Worker issues short-lived signed R2 upload URL
        ↓
Browser uploads directly to R2 quarantine key
        ↓
Worker verifies object and media signature
        ↓
Metadata cleaning / resize / poster generation
        ↓
D1 asset row becomes ready
        ↓
Scene version references asset
```

D1 不存二進位影像，只存 metadata、object key 和 scene references。

### Phase 5：3D viewer

建議 package：

- `three`
- `@react-three/fiber`
- `@react-three/drei`
- `motion` 或 `framer-motion` 作 UI motion
- `@react-three/postprocessing` 只在後期按裝置能力啟用

初版只需要：

- Plane / wall geometry。
- Perspective camera。
- Texture loader。
- VideoTexture。
- Shadow-like CSS/WebGL plane。
- Scene JSON。
- Lazy loading。
- `devicePixelRatio` 上限。
- WebGL context loss recovery。

不要第一版就加入 bloom、SSAO、粒子、物理、動態霧、複雜 shader 和大型迷宮。那些是 Delighter，不是核心價值。

### Scene JSON

Scene config 應由後端和使用者資料生成，不由圖片檔名推導：

```json
{
  "version": 3,
  "layout": "quiet-room",
  "nodes": [
    {
      "assetId": "asset_01",
      "position": [0, 2.1, -4],
      "rotation": [0, 0, 0],
      "caption": "A slow morning"
    }
  ]
}
```

## 10. D1 schema blueprint

最低限度表：

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE chapters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  mood TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  current_version_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE(user_id, slug)
);

CREATE TABLE chapter_versions (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  version_number INTEGER NOT NULL,
  scene_config_json TEXT NOT NULL,
  generation_status TEXT NOT NULL DEFAULT 'ready',
  created_at INTEGER NOT NULL,
  UNIQUE(chapter_id, version_number)
);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  object_key TEXT NOT NULL UNIQUE,
  media_kind TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  original_filename TEXT,
  byte_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  checksum TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'quarantine',
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE share_links (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  current_period_end INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE ai_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  version_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
```

所有 public resource ID 使用 random UUID/ULID，不使用可猜的遞增數字。

## 11. R2 key design

```text
users/{userId}/chapters/{chapterId}/quarantine/{assetId}
users/{userId}/chapters/{chapterId}/original/{assetId}
users/{userId}/chapters/{chapterId}/display/{assetId}.webp
users/{userId}/chapters/{chapterId}/thumb/{assetId}.webp
users/{userId}/chapters/{chapterId}/poster/{assetId}.webp
users/{userId}/chapters/{chapterId}/video/{assetId}.mp4
users/{userId}/chapters/{chapterId}/export/{versionId}.mp4
```

R2 bucket 不公開。所有 object request 經 Worker authorization 或短期 signed URL。Public/unlisted share 也只發短期、scope 到單一 asset 的 URL。

不要使用 `r2.dev` 作 production media domain；使用自訂 domain 或 Worker media route。不要把原檔名放進 public URL。

## 12. Authorization wall

真正的 authorization wall：

- Marketing/sample：不需登入。
- 本地預覽：不需登入。
- 真正上傳：需要 session。
- 建立章節：需要 session。
- 私人章節：需要 session + ownership check。
- Unlisted 分享：token hash + chapter visibility check。
- Public 分享：只有 chapter 明確設為 public 才可看。
- R2 資產：不能因為知道 object key 就下載。
- Billing：只能修改自己的 subscription。

所有 route 都必須在 server side 做：

```text
get session
→ get resource
→ verify resource.user_id === session.user_id
→ verify entitlement/quota
→ perform mutation
```

前端隱藏按鈕不是 authorization。

## 13. Payments and monetization

建議使用網頁 payment provider 的 hosted checkout，不使用 app store。方案：

- Free：1 章、12 圖、1 MP4。
- Memory：`$5/month` 或 `$48/year`。
- Studio：`$12/month` 或 `$108/year`。
- Keepsake：一次性 `$9–19` 作高解析度 export 或 Web archive。

收費的是：

- 更多章節。
- 更多 media quota。
- 版本歷史。
- 高解析度匯出。
- custom share URL。
- premium room styles。

不要收費：

- 每次拖動。
- 每次觀看。
- 每次保存。
- 第 25 張之後的閱讀權。
- 每次圖片定位。

Payment flow：

```text
User clicks upgrade
        ↓
Worker creates hosted checkout session
        ↓
Provider handles payment
        ↓
Signed webhook reaches Worker
        ↓
Worker verifies signature + idempotency
        ↓
D1 entitlement updated
```

不要相信瀏覽器傳回的 plan。不要只在 checkout success page 更新 entitlement。

## 14. PWA from Cloudflare Worker

可以。Cloudflare Workers Static Assets 可以和 Worker code 一起部署 HTML、CSS、JS、manifest 和 service worker；Cloudflare 也支援 SPA fallback。[Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)、[SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)

需要：

- `/manifest.webmanifest`
- 192px 和 512px icons
- `/sw.js`
- HTTPS 或 localhost
- install prompt / browser install UI
- safe cache/update strategy

建議 caching：

- cache-first：hash 過的 JS、CSS、字體。
- stale-while-revalidate：public sample 和非敏感 thumbnail。
- network-first：D1 API。
- 不長期 cache private original、private MP4 或 signed URL。
- service worker 更新使用 versioned cache，避免舊 viewer 與新 scene schema 混合。

PWA 可以免 app store，但會有平台限制：不能把它當完全等同原生 app。PWA 是足夠的第一版本；只有需要背景上傳、深層相簿整合、可靠 push 或原生 GPU 行為時才考慮封裝成 native package。

## 15. Brave compatibility

Brave 近期加強了 WebGL/WebGPU fingerprinting protection，會清理 GPU vendor/renderer 資訊並改變 extension list，目標是保留網站功能而減少 fingerprinting。[Brave privacy update](https://brave.com/privacy-updates/38-webgl-webgpu-fingerprinting-protections/)

參考作品在 Brave 不可見，最可能的產品級原因不是「Brave 不能做 3D」，而是參考 code 沒有 fallback：

- 把 WebGL extensions 當成必要條件。
- 只處理 WebGL render path。
- 沒有 canvas / WebGL context failover。
- 依靠 pointer lock。
- 沒有 2D viewer。

Story Loom 應做：

1. 首先測試 WebGL2。
2. 不行時測試 WebGL1。
3. 所有 extension 都作 optional feature detection。
4. `regl` 或 Three.js context 建立失敗時切換到 2.5D/DOM viewer。
5. 處理 `webglcontextlost` 和 `webglcontextrestored`。
6. 不讀 GPU renderer 資訊作識別或 fingerprint。
7. 不用 canvas fingerprinting。
8. 不強制 pointer lock，提供 drag/swipe。
9. 將 device pixel ratio cap 在 1.25–1.5。
10. 自動降低 texture resolution、shadow 和 postprocessing。
11. 使用者可以關閉 motion、reflection 和 effects。
12. 在 Brave Shields 下不依賴第三方 tracking script。

測試矩陣：

- Chrome，WebGL 開啟／關閉。
- Firefox。
- Brave Shields Standard。
- Brave Shields Aggressive。
- Brave hardware acceleration 開啟／關閉。
- iOS Safari。
- Android Chrome/Brave。
- low-end Android。

## 16. Security baseline

### Critical

- 私人 R2 object 不可公開。
- 所有 chapter / asset / share route 做 ownership check。
- 第三方 API key 只放 Worker secrets。
- cookie session 不放 localStorage。
- password 不保存明文。
- Stripe webhook 驗證 signature 和 idempotency。
- upload 驗證真實檔案格式，不信任副檔名。

### High

- 清洗圖片和 MP4 metadata。
- 限制解碼後像素、GIF 幀數、MP4 時長。
- rate limit login、upload、AI、share token。
- generic login error，避免 username enumeration。
- CSRF / Origin check，因為 session 是 cookie-based。
- CSP、`frame-ancestors`、`X-Content-Type-Options: nosniff`、合理 Referrer-Policy。
- 不使用 `innerHTML`、`dangerouslySetInnerHTML` 處理使用者文字。
- 不把 public object key 當作授權。

目前 scaffold 的 [`src/routes/__root.tsx`](/Users/nosensetxt/mvp/story-loom/src/routes/__root.tsx) 第 39 行有 `dangerouslySetInnerHTML`，目前內容是固定的 theme script，不等於已證實的 XSS；產品化時應改成 nonce/hash CSP 或安全的啟動方式，並確保永遠不把使用者內容放入其中。

### PWA security

- service worker 只 cache 必要 assets。
- 不把 bearer token 放 cache。
- 不長期 cache private photo。
- 更新 service worker 時清理舊 schema cache。
- 發生 logout/delete 時清除可撤銷的本地 app state。

## 17. Implementation order

1. Scaffold rename and product shell。
2. D1 migrations and typed bindings。
3. Auth and HttpOnly sessions。
4. Chapter CRUD and authorization wall。
5. R2 signed upload for PNG/WebP/GIF。
6. Metadata cleaning and thumbnail pipeline。
7. Asset processing status and retry/idempotency。
8. Quiet View 2D/2.5D viewer。
9. Scene JSON and basic wall renderer。
10. Walk View with Three.js。
11. MP4 poster and click-to-play。
12. Optional AI chapter arrangement with usage ledger。
13. Share links and private/public controls。
14. PWA manifest and service worker。
15. Payment checkout and verified webhooks。
16. Brave/Firefox/Chrome/mobile QA。
17. Production deploy and rollback plan。

## 18. Definition of done for v1

產品只有在以下全部成立，才算 v1 ready：

- 新用戶可以不登入觀看 sample。
- 新用戶可以登入並建立章節。
- PNG/WebP/GIF 5MB 上限在 client 和 Worker 都有效。
- MP4 20MB、30 秒限制在 client 和 Worker 都有效。
- metadata 清洗後再進入正式 asset state。
- 使用者無法讀取其他人的 private object。
- 訂閱失效不會鎖死舊章節閱讀。
- 8 張圖片可以在沒有 AI 的情況下建立 chapter。
- AI 只在 opt-in 且有 idempotency 時呼叫。
- Quiet View 在沒有 WebGL 時仍可用。
- Walk View 在 Chrome、Firefox 和 Brave 有 fallback。
- PWA 可以安裝、更新和撤銷舊 cache。
- Stripe webhook 可以重播而不重複授權。
- logout、delete account、revoke share link 都能真正阻止後續存取。

## 最終產品答案

Story Loom 要建成的是：

> 一個 privacy-first、可漫遊、可回訪的生活章節空間。

參考 gallery 提供的是 renderer 和空間靈感；TanStack Start 提供的是 route、server functions 和 React foundation；Cloudflare Worker 提供 edge backend；D1 保存結構化資料；R2 保存清洗後的 media；Three.js 提供 Quiet View 以外的 Walk View；AI 只是使用者主動召喚的整理者，而不是產品本身。

