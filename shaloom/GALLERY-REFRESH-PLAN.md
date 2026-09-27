# Gallery refresh checklist

Implementation checklist for the requested gallery refinements and mobile fit.

- [x] Add five in-gallery lighting presets: Dim, Lighter, Daylight, Twilight, and Evening Party. Switch lighting uniforms without rebuilding the WebGL context.
- [x] Play MP4 media on its wall painting after a tap or click, with accessible play/pause/seek controls and cleanup when the user closes details or walks away.
- [x] Keep the gallery order stable: use R2 object upload timestamps with a stable filename tie-break, and queue parallel image decodes into catalogue order. Shuffle remains an explicit action.
- [x] Add three painting treatments: image extended over the sides, wood, and silver metal. Switch the shader treatment in place.
- [x] Add bounded artwork size controls, initially one step larger than the previous default.
- [x] Let a user select a painting on desktop or mobile and show its R2 custom-metadata description when present. Use a clear empty-state when no description exists.
- [x] Make gallery controls responsive to narrow/short screens and safe areas. Allow button labels to wrap and prevent control labels from escaping their boxes.
- [ ] Deploy the Worker and verify the production UI and media behavior.

Scope note: this gallery-only demo has no upload editor or post-upload drag-and-drop sorting flow. Those flows are left untouched.
