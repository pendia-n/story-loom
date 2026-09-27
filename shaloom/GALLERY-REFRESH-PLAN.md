# Gallery refresh checklist

Implementation checklist for the requested gallery refinements and mobile fit.

- [x] Add five in-gallery lighting presets: Dim, Lighter, Daylight, Twilight, and Evening Party. Switch lighting uniforms without rebuilding the WebGL context.
- [x] Play MP4 media on its wall painting after a tap or click, with accessible play/pause/seek controls and cleanup when the user closes details or walks away.
- [x] Keep the gallery order stable: use R2 object upload timestamps with a stable filename tie-break, and queue parallel image decodes into catalogue order. Shuffle remains an explicit action.
- [x] Add three painting treatments: image extended over the sides, wood, and silver metal. Switch the shader treatment in place.
- [x] Add bounded artwork size controls, initially one step larger than the previous default.
- [x] Let a user select a painting on desktop or mobile and show its R2 custom-metadata description when present. Use a clear empty-state when no description exists.
- [x] Make gallery controls responsive to narrow/short screens and safe areas. Allow button labels to wrap and prevent control labels from escaping their boxes.
- [x] Deploy the Worker and verify the production UI at desktop, 390px portrait, 320px narrow-phone, and 844px landscape sizes. The settings panel stays inside the viewport and its button labels do not overflow.
- [x] Verify the deployed MP4 asset endpoint returns HTTP 200 as `video/mp4` and supports byte ranges (`demo/9k.mp4`).
- [ ] Complete an end-to-end live check of selecting that MP4 painting, watching its texture move, and using pause/seek. The code path is present, but this browser session did not reach the MP4 painting reliably enough to claim playback was visually verified.

Deployment checked: `https://shaloom.pendia-community.workers.dev`, version `a0484875-2455-493f-b858-797bd48aeb42`.

Scope note: this gallery-only demo has no upload editor or post-upload drag-and-drop sorting flow. Those flows are left untouched.
