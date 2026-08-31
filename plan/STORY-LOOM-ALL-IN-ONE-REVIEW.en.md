# Story Loom: All-in-One Product, Technical, UX, Business, and Security Review

Version: 2026-08-31  
Status: Product blueprint; this document does not mean the features are implemented.

## 0. Executive summary

Story Loom should be positioned as:

> Photos and small moving moments, woven into a quiet chapter you can walk back into.

It is not a normal photo album, an AI photo analyzer, or only a 3D demo. The core experience is a private, revisit-able space for a trip, life season, relationship, pet, creative project, or family memory.

Final recommendations:

- Accept PNG, WebP, and GIF; limit each image to 5MB.
- Allow MP4, but treat it as a small “moving memory card,” not a video archive.
- Memory tier: 60 images and 3 MP4 files per chapter.
- Do not call AI automatically for every upload, open, or drag.
- Borrow the reference gallery’s spatial wall, shadow, lazy-loading, and culling ideas.
- Do not make a large random maze the only viewer.
- Make Quiet View the default and Walk View the optional immersive mode.
- Cloudflare Workers + TanStack Start + D1 + R2 + PWA can support the product.
- Enforce authorization on the server for every chapter and media request.

## 1. Verified repository state

`/Users/nosensetxt/mvp/story-loom` is currently a fresh TanStack Start / Cloudflare Vite scaffold, not an implemented Story Loom product.

Verified:

- [`package.json`](/Users/nosensetxt/mvp/story-loom/package.json) line 2 still names the package `my-tanstack-start-app`.
- [`wrangler.jsonc`](/Users/nosensetxt/mvp/story-loom/wrangler.jsonc) line 7 still names the Worker `my-tanstack-start-app`.
- There is no D1 binding.
- There is no R2 binding.
- There is no auth, session, payment, subscription, AI, upload, or PWA implementation.
- [`src/routes/index.tsx`](/Users/nosensetxt/mvp/story-loom/src/routes/index.tsx) is still the generic starter page.
- [`src/routes/__root.tsx`](/Users/nosensetxt/mvp/story-loom/src/routes/__root.tsx) still includes TanStack devtools and the starter theme script.
- The existing TanStack Start, React, Vite, Cloudflare Vite plugin, and Wrangler dependencies are a usable foundation.

Not yet implemented:

- D1 schema
- private R2 media delivery
- username/password auth
- HttpOnly sessions
- authorization wall
- AI pipeline
- 3D chapter viewer
- MP4 processing
- Stripe payment
- PWA installability
- Brave fallback

## 2. Reference 3D gallery review

Reference site: [3D Art Gallery](https://25920.github.io/threed-art-gallery/)  
Reference repository: [25920/threed-art-gallery](https://github.com/25920/threed-art-gallery)

In Google Chrome I observed:

- A gray-white gallery.
- Reflective flooring.
- Multiple wall surfaces.
- Paintings mounted on the walls.
- Captions under the paintings.
- Pressing `W` moves the camera forward.
- No obvious onboarding, entrance, back button, or chapter navigation.
- The main experience is rendered by a WebGL canvas with almost no semantic DOM.

The source confirms:

- `src/index.js` creates the WebGL render loop with `regl`.
- `src/fps.js` handles WASD, touch, and pointer-lock camera behavior.
- `src/map.js` procedurally generates a large maze/gallery wall layout.
- `src/placement.js` loads, unloads, and culls images by distance and view.
- `src/image.js` selects lower or higher image resolution based on network conditions.
- `src/painting.js` produces image thickness, shadows, and reflection-like shading.
- `src/text.js` renders captions into a texture.
- `api/local.js` and `images/generateList.js` rely on local filenames and a generated image list.

The reference repository is MIT licensed: [LICENSE](https://github.com/25920/threed-art-gallery/blob/master/LICENSE). Parts can be studied or reused with attribution, but the data model and user flow must be redesigned for Story Loom.

### Keep

- Art on walls.
- Gentle spatial depth.
- Shadows, thickness, and restrained reflection.
- The feeling of entering a chapter.
- Loading nearby media only.
- View-based rendering culling.
- Touch navigation.

### Do not copy directly

- A random large maze.
- Mandatory pointer lock.
- No entrance or return path.
- No progress or memory index.
- WebGL-only rendering with no fallback.
- Filename-plus-JSON as the user data model.

## 3. Positioning and emotional direction

Working name: Story Loom.

Product line:

> Your life, somewhere you can walk back into.

Visual direction: Midnight Memory Room.

| Use | Color | Hex |
|---|---|---|
| Night background | Midnight navy-black | `#111827` |
| Secondary background | Deep indigo | `#1E1B35` |
| Paper/card | Aged cream | `#F4EBDD` |
| Primary text | Dark coffee | `#352A25` |
| Soft focus | Honey apricot | `#D99A6C` |
| Highlight | Dusk gold | `#E9C46A` |
| Calming tone | Gray sage | `#8FA79A` |
| Emotional accent | Rose copper | `#B96A67` |
| Future tone | Faded sky blue | `#91B7C7` |

Principles:

- Motion should breathe rather than behave like a game effect.
- Avoid neon, AI-purple glow, and dashboard language.
- Avoid streaks, rankings, and forced daily engagement.
- Return visits should feel comforting, not compulsory.
- Chapters should be private by default.

## 4. Media specification

### Images

Accept PNG, WebP, and GIF, including animated GIF. Reject JPG/JPEG, SVG, AVIF, HEIC, and other formats.

Recommended limits:

- 5MB per image.
- 8,192px maximum width and height.
- 40MP maximum decoded pixel area.
- 60 GIF frames maximum.
- 8 seconds maximum GIF duration.
- 20 selected files per upload batch.

The browser `accept` attribute is only UX. The Worker must re-check magic bytes, MIME, decoded dimensions, decoded pixel area, and animation frame limits.

### MP4

Yes, allow MP4, but give it a separate role and quota.

Recommended limits:

- `video/mp4` only.
- 20MB per file.
- 30 seconds maximum.
- 1280×720 maximum.
- Free: 1 video per chapter.
- Memory: 3 videos per chapter.
- Studio: 8 videos per chapter.
- Click-to-play.
- No automatic sound.
- No video vision analysis in MVP.

Render an MP4 as a “moving memory card” first: poster, subtle breathing animation, and play icon. Play it only after a user gesture using `VideoTexture` or a normal HTML video element.

Do not force MP4 into the 5MB image limit. A short phone clip can easily exceed 5MB. R2 supports single PUT for smaller files and multipart upload for larger files, so the browser can upload directly to a signed R2 URL.[R2 upload docs](https://developers.cloudflare.com/r2/objects/upload-objects/)

## 5. Chapter quota

Do not lock reading after the 25th image. That turns Fountain into Tap.

| Plan | Images/chapter | MP4/chapter | Chapters |
|---|---:|---:|---:|
| Free | 12 | 1 | 1 |
| Memory | 60 | 3 | 12 |
| Studio | 120 | 8 | 50 |

After cancellation or expiry:

- Existing chapters remain readable.
- Existing share links should not suddenly disappear unless revoked by the owner.
- New media above quota is blocked.
- Premium exports and premium effects are blocked.
- Existing data is not deleted.

## 6. Privacy-first metadata pipeline

Images and videos should be cleaned by default. Metadata may contain GPS, capture time, device model, camera information, editing software, IPTC, XMP, and EXIF. ICO specifically notes that image EXIF may include GPS coordinates, dates, and times.[ICO guidance](https://ico.org.uk/media2/pbwchh24/disclosing-documents-to-the-public-securely-all-1-0-0.pdf)

Pipeline:

1. Upload into a private quarantine key.
2. Verify format and content.
3. Decode and re-encode.
4. Remove GPS, EXIF, XMP, IPTC, and device information.
5. Generate thumbnail, display image, and video poster.
6. Move only cleaned objects into the normal chapter state.
7. Never expose the original filename as a public URL.

Cloudflare image transformations also support a `metadata=none` style of metadata removal; application-level validation is still required.[Cloudflare metadata docs](https://developers.cloudflare.com/images/optimization/features/)

User-facing copy:

> We remove hidden location and device data before your memory enters the Loom.

## 7. AI policy and cost control

Do not call AI when the user uploads one image, opens a chapter, drags an image, chooses a color, edits a title, plays an MP4, or moves the 3D camera.

Call AI only when the user explicitly asks:

> Help this chapter find its feeling

Use one request for a batch, not one request per image.

Recommended frequency:

- New chapter: at most one vision call.
- Added batch: at most one vision call after the user presses settle.
- Tone rewrite: one text-only call.
- Narration: at most one call per chapter version.
- Cache by image checksum and prompt hash.

DeepSeek V4 Flash Vision currently has an upper bound of roughly 384 image tokens per image; the API usage response is the billing source of truth.[DeepSeek Vision](https://api-docs.deepseek.com/guides/vision/)

The current official pricing page lists roughly `$0.22 / 1M` cache-miss input tokens off-peak and `$0.66 / 1M` output tokens off-peak, with peak pricing around twice that rate.[DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/)

Rough estimates:

| Analysis | Approx. input | Output | Approx. off-peak cost |
|---|---:|---:|---:|
| 8 images | 3,500 | 300 | `$0.001` |
| 25 images | 10,100 | 400 | `$0.0025` |
| 60 images | 23,500 | 500 | `$0.0055` |

For 5,000 users, one chapter each, 25 images per chapter, and one analysis per chapter, the vision-model estimate is about `$12–25`, depending on time and actual usage. This excludes retries, R2, image processing, video transcoding, other models, and traffic.

Set product-level limits:

- One vision generation per chapter version.
- Free: 3 AI jobs per month.
- Memory: 30 AI jobs per month.
- Studio: 150 AI jobs per month.
- Log provider, model, tokens, cost, chapter, and idempotency key.
- A failed AI job must not consume the user’s product quota.

Use outcome language rather than AI language:

- Help this chapter find its feeling.
- Give this memory a gentle beginning.
- Quietly arrange my chapter.
- Find the warmth in these moments.

AI output is always editable and must never be presented as a quote the user actually said.

## 8. UX from start to finish

### First visit

1. Show an interactive sample chapter.
2. Let users view the sample without signing in.
3. Click `Make a chapter`.
4. Select and preview files locally.
5. Require sign-in only before real upload/save.
6. Explain metadata cleaning.
7. Choose a chapter name and mood.
8. Create Quiet View immediately.
9. Offer `Walk through` as the optional 3D mode.

### Eight uploaded images

Eight images should become one chapter cover, eight memory nodes, one fixed and returnable route, an optional short line, optional AI title/captions/mood, and optional moving nodes. It should not be just a grid or an immediate AI novel.

### Updating a chapter

1. Open a chapter.
2. Click `Add a moment`.
3. Choose an image or MP4.
4. Show type, size, and metadata-cleaning status.
5. Put the media in a pending state.
6. Show `Finding a place for this moment…`.
7. Place it using deterministic layout.
8. Let the user choose a mood.
9. Save a new version with `Let it settle`.
10. AI organization is optional and never blocks the basic chapter.

### Viewer modes

Quiet View is the default: swipe/drag, focus one memory, click to enlarge, show progress, jump to any node, and disable motion.

Walk View is optional: WASD and mouse drag on desktop, swipe/drag/auto-walk on mobile, return to entrance, next-memory control, no mandatory pointer lock, and a 2D fallback.

Focus View shows one image or MP4, a short line, optional note, and click-to-play video.

## 9. Turning the barebone TanStack app into the product

### Phase 0: Clean the scaffold

- Rename package and Worker from `my-tanstack-start-app` to `story-loom`.
- Replace starter header, footer, title, and about page.
- Remove TanStack devtools from production.
- Do not publish source maps publicly, or send them only to protected error reporting.
- Preserve the existing dev, build, deploy, and Cloudflare type-generation scripts.

### Phase 1: Bindings and data

Add D1 and R2 bindings in Wrangler, then manage schema through D1 migrations. Do not edit production tables manually.

### Phase 2: TanStack routes and server functions

Recommended routes:

```text
/                         marketing/sample
/login                    auth
/register                 auth
/app                      chapter list
/app/chapters/new         creation flow
/app/chapters/$chapterId  editor + viewer
/share/$shareToken        public/unlisted viewer
/settings/privacy         privacy and deletion
/settings/billing         subscription and receipt
```

TanStack loaders read page data. Server functions or route handlers perform mutations. Every mutation re-validates session, ownership, quota, and payload on the Worker.

### Phase 3: Authentication

Start with username/password and optional email recovery. Use a proven auth implementation rather than inventing password crypto. Store only a strong password hash and salt, create server-side sessions, and issue an opaque random cookie ID.

Production cookie:

```text
__Host-storyloom_session=<opaque-id>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000
```

Revoke sessions on logout, account deletion, and security events. Never put session tokens in localStorage. Never ship AI, Stripe, or R2 secrets in the Vite client bundle.

### Phase 4: Upload pipeline

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
D1 asset becomes ready
        ↓
Scene version references asset
```

D1 stores metadata, object keys, and scene references; it does not store binary media.

### Phase 5: 3D viewer and packages

Recommended packages:

- `three`
- `@react-three/fiber`
- `@react-three/drei`
- `motion` or `framer-motion` for UI motion
- `@react-three/postprocessing` only when device capability allows it

V1 needs only planes/walls, a perspective camera, texture loading, `VideoTexture`, restrained shadow treatment, scene JSON, lazy loading, pixel-ratio limits, and context-loss recovery. Do not begin with bloom, SSAO, particles, physics, dynamic fog, complex shaders, and a huge maze.

Scene configuration should be generated from D1 and user data rather than filenames:

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

Minimum tables:

- `users`: identity, username, email, password hash/salt, timestamps, deletion state.
- `sessions`: hashed session ID, user, expiry, revocation.
- `chapters`: owner, title, visibility, current version, timestamps.
- `chapter_versions`: immutable scene config, version number, status.
- `assets`: owner, chapter, object key, media kind, MIME, size, dimensions, duration, checksum, processing status.
- `share_links`: chapter, hashed random token, expiry, revocation.
- `entitlements`: plan, status, provider customer/subscription IDs, period end.
- `ai_jobs`: model, job type, status, tokens, cost, idempotency key, chapter/version.

Use random UUID/ULID public IDs, not guessable incrementing IDs. All foreign keys and indexes should be added through migrations.

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

Keep the bucket private. Serve objects through Worker authorization or short-lived signed URLs scoped to a single asset. Do not use `r2.dev` as the production media domain. Do not expose original filenames in public URLs.

## 12. Authorization wall

- Marketing and sample: no login.
- Local preview: no login.
- Real upload: session required.
- Chapter creation: session required.
- Private chapter: session plus ownership check.
- Unlisted share: hashed token plus visibility check.
- Public share: only when explicitly marked public.
- R2 objects: object keys alone never grant access.
- Billing: users can modify only their own subscription.

Every protected operation should follow:

```text
get session
→ get resource
→ verify resource.user_id === session.user_id
→ verify entitlement/quota
→ perform mutation
```

Hiding a button in React is not authorization.

## 13. Payments and monetization

Use hosted web checkout rather than an app store:

- Free: one chapter, 12 images, one MP4.
- Memory: `$5/month` or `$48/year`.
- Studio: `$12/month` or `$108/year`.
- Keepsake: one-time `$9–19` for high-resolution export or a downloadable archive.

Charge for capacity, version history, exports, custom share URLs, and premium room styles. Do not charge for dragging, viewing, saving, positioning, or access to the 26th image.

Payment flow:

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

Do not trust a plan sent by the browser or update entitlements only on a success page.

## 14. PWA on Cloudflare Workers

Yes. Workers Static Assets can deploy HTML, CSS, JavaScript, a manifest, and a service worker together with Worker code; Cloudflare also supports SPA fallback.[Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) and [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)

Required:

- `/manifest.webmanifest`
- 192px and 512px icons
- `/sw.js`
- HTTPS or localhost
- install UI/prompt
- safe caching and update strategy

Caching plan:

- Cache-first for hashed JS, CSS, and fonts.
- Stale-while-revalidate for the public sample and non-sensitive thumbnails.
- Network-first for D1 API data.
- Do not permanently cache private originals, private MP4, or signed URLs.
- Use versioned caches so old viewers do not mix with new scene schemas.

PWA is sufficient for v1 and avoids app-store publication. Native packaging should wait until background uploads, deep photo-library integration, dependable push, or native GPU capabilities become proven requirements.

## 15. Brave compatibility

Brave recently strengthened WebGL/WebGPU fingerprinting protection by de-identifying GPU vendor/renderer information and changing the exposed extension list, while aiming to preserve website functionality.[Brave privacy update](https://brave.com/privacy-updates/38-webgl-webgpu-fingerprinting-protections/)

If the sample fails in Brave, the likely product-level issue is the reference implementation’s lack of fallback, not that Brave cannot render 3D:

- It treats some WebGL extensions as required.
- It has only a WebGL render path.
- It has no canvas/WebGL failover.
- It relies on pointer lock.
- It has no 2D viewer.

Story Loom should:

1. Test WebGL2.
2. Fall back to WebGL1.
3. Treat all extensions as optional.
4. Fall back to a 2.5D/DOM viewer when context creation fails.
5. Handle `webglcontextlost` and `webglcontextrestored`.
6. Never use GPU renderer strings for identification or fingerprinting.
7. Never use canvas fingerprinting.
8. Offer drag/swipe instead of requiring pointer lock.
9. Cap device pixel ratio at roughly 1.25–1.5.
10. Reduce textures, shadows, and post-processing based on capability.
11. Let users disable motion, reflection, and effects.
12. Avoid third-party tracking scripts under Brave Shields.

Test Chrome with WebGL on/off, Firefox, Brave Shields Standard/Aggressive, Brave hardware acceleration on/off, iOS Safari, Android Chrome/Brave, and low-end Android.

## 16. Security baseline

Critical:

- Private R2 objects must not be public.
- Every chapter, asset, share, and billing route must check ownership.
- Provider keys stay in Worker secrets.
- Session tokens stay out of localStorage.
- Passwords are never stored in plaintext.
- Payment webhooks verify signatures and idempotency.
- Uploads are checked by actual file content, not just extensions.

High:

- Clean image and video metadata.
- Bound decoded pixels, GIF frames, and MP4 duration.
- Rate-limit login, upload, AI, and share-token endpoints.
- Use generic login errors to reduce username enumeration.
- Add CSRF/Origin checks for cookie-authenticated mutations.
- Add CSP, `frame-ancestors`, `X-Content-Type-Options: nosniff`, and a reasonable Referrer-Policy.
- Render user text through React rather than `innerHTML` or unsafe HTML sinks.
- Never treat a public object key as authorization.

The current scaffold’s [`src/routes/__root.tsx`](/Users/nosensetxt/mvp/story-loom/src/routes/__root.tsx) line 39 uses `dangerouslySetInnerHTML` for a constant theme script. That is not evidence of an XSS vulnerability by itself, but productization should move toward a nonce/hash CSP-safe initialization path and must never place user content in that script.

PWA security:

- Cache only necessary assets.
- Never cache bearer tokens.
- Do not persist private media indefinitely in the service worker cache.
- Version and retire old caches.
- Clear revocable local state after logout or account deletion.

## 17. Implementation order

1. Rename the scaffold and create the product shell.
2. Add D1 migrations and typed bindings.
3. Add auth and HttpOnly sessions.
4. Add chapter CRUD and the authorization wall.
5. Add signed R2 upload for PNG/WebP/GIF.
6. Add metadata cleaning and thumbnails.
7. Add processing status, retries, and idempotency.
8. Build Quiet View 2D/2.5D.
9. Add scene JSON and the basic wall renderer.
10. Add Three.js Walk View.
11. Add MP4 poster and click-to-play.
12. Add opt-in AI chapter arrangement with a usage ledger.
13. Add share links and visibility controls.
14. Add PWA manifest and service worker.
15. Add hosted checkout and verified webhooks.
16. QA Chrome, Firefox, Brave, and mobile.
17. Deploy with rollback and operational monitoring.

## 18. Definition of done for v1

- Visitors can view the sample without logging in.
- Users can sign in and create chapters.
- PNG/WebP/GIF 5MB limits work in both client and Worker.
- MP4 20MB/30-second limits work in both client and Worker.
- Metadata is cleaned before an asset becomes ready.
- Users cannot fetch another user’s private object.
- Expired subscriptions do not lock old chapters.
- Eight images create a chapter without AI.
- AI requires opt-in and idempotency.
- Quiet View works without WebGL.
- Walk View has a Chrome/Firefox/Brave fallback.
- The PWA installs, updates, and retires old caches safely.
- Webhook replays do not duplicate entitlements.
- Logout, account deletion, and share-link revocation actually stop access.

## Final product answer

Story Loom should become:

> A privacy-first, revisit-able, walkable space for the chapters of a life.

The reference gallery provides renderer and spatial inspiration. TanStack Start provides routing, server functions, and the React foundation. Cloudflare Workers provide the edge backend. D1 stores structured data. R2 stores cleaned media. Three.js powers Walk View. AI is an optional quiet organizer, not the product itself.

