# Shaloom

**Live out your motto.** A walk-through gallery for the work and moments people want to stay with.

This build is a public, no-login demo. It includes a quiet landing page with a non-interactive gallery preview and a full-screen walkable gallery at `/gallery`. The supplied sample collection is the only collection in this build; personal accounts, uploads, and billing are not implemented here.

## Gallery behavior

- The browser runs one WebGL renderer for the entire room. The room layout uses a fixed procedural seed, so a refresh does not move the paintings to a newly randomized wall plan.
- Artwork order is stable and naturally sorted by filename. A viewer may explicitly choose **Shuffle on purpose**; that choice is encoded in the URL so refreshing keeps the same shuffled sequence. **Use steady order** returns to the default.
- Desktop: use arrow keys or WASD to walk, click the room and drag to look, and press Escape to release mouse capture.
- Touch: tap a point to move toward the visible wall or floor, and drag to look around.
- The supplied MP4 appears as a framed cover in the room. Its separate player streams the original MP4 from R2 and supports byte-range requests for seeking; the stored video is not re-encoded.
- The renderer creates display textures from images without changing the R2 originals. The current display texture is capped at 2048 pixels on its longest edge to keep the walkable scene responsive.

## Cloudflare resources

- Worker: `shaloom`
- Private R2 bucket: `s-w`, with the supplied demonstration media under `demo/` and the generated MP4 cover under `demo/posters/`
- D1 database: `shaloom-db`, bound as `DB` and intentionally left empty (no tables or rows)
- The Worker exposes read-only `GET /api/gallery-media` and `GET`/`HEAD /media/...` routes, limited to demo objects. It has no login, upload, or public bucket endpoint.

## Project checks and deploy

```sh
pnpm run test:catalog
pnpm run typecheck
pnpm run build
pnpm run deploy
```

Use the authenticated Wrangler session for Cloudflare operations. Do not place credentials in source control. The gallery renderer is compiled from the isolated CommonJS source under `app/gallery/vendor/` by `build:gallery`; the associated MIT license is kept beside that source.

## Reference implementation

The room geometry, first-person movement, touch raycast movement, frame placement, and artwork texture lifecycle are adapted from the user-provided `threed-art-gallery` source. The upstream MIT license is preserved in `app/gallery/vendor/LICENSE`. The upstream viewer is image-only; Shaloom adds the R2 catalogue, deterministic ordering/layout seed, cover art, and MP4 player separately.
