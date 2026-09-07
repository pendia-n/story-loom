# Story Loom

## What the app is

Story Loom is a private, mood-led 3D memory gallery. A person brings a small set of PNG, WebP, GIF, or short MP4 memories into a chapter, and Story Loom turns that chapter into a room they can revisit in three ways:

- **Room wall** — a composed exhibition wall for seeing the whole chapter.
- **Orbit** — a slow, weightless arrangement of memories.
- **Walk inside** — a first-person corridor that can be explored with keyboard, pointer, or touch-friendly controls.

The product is intentionally a calm place to return to, not a public feed, productivity dashboard, or infinite social timeline. Its emotional promise is: **keep the glow of every chapter**.

## Why it was created

Most photo tools optimize for capture, sorting, sharing, or storage. They help people manage a camera roll, but rarely help them feel the meaning of a chapter after the event has passed. Story Loom was created to make the return itself valuable: a quiet visit to a personal room where a trip, friendship, season, project, or ordinary happy day can still have atmosphere.

The initial inspiration was a simple 3D gallery project that required a person to replace image filenames and edit an HTML list by hand. Story Loom keeps the distinctive gallery feeling while removing that technical barrier. People upload memories, name a chapter, and enter the room; they do not need to edit code, rename references, or understand a build process.

## The user problem

Story Loom addresses four connected problems:

1. **Memories become hard to revisit.** They are scattered across camera rolls, chats, cloud folders, and social posts.
2. **Ordinary photo galleries feel interchangeable.** A grid is useful for finding an image, but not always for feeling a whole period of life.
3. **Creative tools often ask too much work.** File naming, manual layout, prompts, timelines, and editing controls turn a leisure activity into a task.
4. **People are cautious about invasive image technology.** Users may not want their private images automatically analyzed, publicly exposed, or altered without clear consent.

Story Loom answers with a private chapter, a deterministic 3D presentation, direct controls, optional enhancement, and explicit boundaries around external AI processing.

## How Story Loom reduces stress

### Assimilation

The app absorbs the organizing work into one gentle flow:

1. Create a chapter with a title and optional note.
2. Add supported images or short MP4 moments.
3. Let Story Loom create the room automatically.
4. Choose a view or atmosphere only if it improves the visit.

There is no required prompt, code editing, filename mapping, timeline assembly, or public posting step.

### Assurance

The app gives users clear, predictable boundaries:

- Chapters are private to the account by default.
- Room viewing is not metered by visit.
- Supported image formats are restricted to PNG, WebP, and GIF; JPEG, JPG, SVG, and AVIF are not accepted.
- Images are limited to 5 MB each.
- MP4 is limited to 25 MB and 30 seconds.
- Image metadata cleansing can remove supported EXIF, XMP, comment, and time-related metadata before R2 storage.
- MP4 is validated but not rewritten by the metadata cleanser.
- External AI is an explicit, user-requested Quiet Editor action rather than an automatic background process.
- AI requests are recorded with their selected function, model, token usage when returned, and provider-reported cost when available.
- The application uses username/password authentication, HttpOnly JWT-backed sessions, CSRF protection for state-changing browser actions, and optional TOTP or two-question recovery.

The interface should explain what will happen before a consequential action, especially upload, external AI sharing, payment, replacement of a custom background, and deletion.

### Practical next steps

Every empty or blocked state should tell the person what to do next in plain language:

- An empty chapter says to add the first memory.
- An unsupported file explains the accepted formats and size limit.
- A full chapter explains the current tier limit and the available Studio capacity add-on.
- A disabled atmosphere explains which tier contains it.
- A missing recovery method explains that recovery is impossible without a remembered username and a previously configured factor.
- A failed 3D context falls back to an accessible two-dimensional gallery.
- A payment that is not configured is reported as unavailable; the app never pretends the entitlement exists.

The product should always preserve a useful path back to the chapter, even when the user skips AI, effects, payment, or WebGL.

## What makes it unique

Story Loom combines several choices that are usually separated:

1. **A private memory ritual rather than a social feed.** The core action is returning, not performing for an audience.
2. **A real 3D room with three distinct ways to visit.** Three.js is the presentation layer; the gallery does not depend on generative AI to exist.
3. **Atmosphere as a user-controlled emotional layer.** Morning, Night, Twilight, After noon, and Sun rise change the room's gradient, fog, and lighting. Studio users can replace the gradient with their own background image.
4. **Fountain-over-tap economics.** Users pay for room capacity, optional editor allowance, or a permanent chapter finish—not for every visit or every moment of reflection.
5. **Quiet, consent-based assistance.** The Quiet Editor is framed as help with a chapter, caption, order, accessibility, or a future postcard. It is not presented as a machine claiming to know the user's life.
6. **Privacy-aware media handling.** Supported image metadata can be removed before storage, and the user can choose whether a specific AI request may be sent to an external provider.
7. **A graceful degradation path.** If WebGL fails or a browser behaves differently, the person can still view and select the underlying memories in a two-dimensional gallery.

## Product boundaries

Story Loom is not intended to be:

- A public social network or algorithmic discovery feed.
- A replacement for a full photo backup service.
- An always-on AI companion that continuously analyzes a camera roll.
- A professional video editor.
- A pay-per-click viewer where revisiting a memory consumes money.

The product's center of gravity is a small, beautiful, revisitable chapter.

## Current product rules

### Plans

| Plan | Chapters | Per-chapter media | Quiet Editor allowance | Atmosphere |
|---|---:|---:|---:|---|
| Keepsake / Free | 1 | 12 images + 1 short video | 3 requests / month | Morning, Night, After noon |
| Memory | 12 | 60 images + 3 short videos | 30 requests / month | All five gradients |
| Studio | 50 | 120 images + 8 short videos | 150 requests / month | All five gradients + custom image |

Studio capacity add-ons are deliberately explicit:

- **+1 chapter:** $5 one time.
- **+50 images per chapter:** $3 one time.
- **+15 short videos per chapter:** $2.50 one time.
- **+100 Quiet Editor requests:** $1 one time, added to the current Studio allowance.

Permanent chapter finishes are separate from recurring viewing:

- Golden Hour — $1.99.
- Rain Window — $1.99.
- Stardust Ceiling — $2.99.
- Premiere Night — $3.99.

Each finish is attached to a chapter and is intended to work in Room, Orbit, and Walk.

## Current implementation status

Implemented in the current Cloudflare Worker application:

- TanStack Start application structure.
- Cloudflare D1 for relational application data.
- Cloudflare R2 for private media objects.
- Username/password auth with Worker-compatible PBKDF2 hashing.
- JWT-backed HttpOnly session cookie using `JWT_SECRET`.
- CSRF checking on browser state-changing actions.
- D1-backed rate limits for registration, sign-in, uploads, and Quiet Editor requests without storing raw IP addresses.
- Optional TOTP setup during registration and later from Security.
- Optional two-question recovery with independently changeable questions and different answers.
- PNG, WebP, GIF, and MP4 validation.
- Image metadata cleansing before image storage when requested.
- MP4 authenticity, 25 MB, and 30-second duration checks.
- Five chapter atmosphere modes, tier-gated on the server.
- Studio custom background replacement with deletion of the previous R2 object after the new object is accepted.
- Studio capacity entitlement calculations from paid D1 purchases.
- Stripe product routing for subscriptions, permanent finishes, and Studio add-ons.
- Three.js Room, Orbit, and Walk rendering with atmospheric lighting and the four permanent finishes.
- Upload-preview ordering and persistent post-upload ordering shared by Room, Orbit, and Walk.
- Caption editing and explicit destructive controls for individual memories and whole chapters.
- Confirmed account deletion that cancels an active Stripe subscription before removing D1 records, sessions, and private R2 objects.
- Quiet Editor image selection with explicit provider consent, ownership validation, and real image input for visual actions.
- Quiet Editor idempotency keys so retries do not create duplicate completed jobs or consume duplicate allowance.
- Install guidance plus a versioned service-worker shell that excludes private media and API responses.
- Two-dimensional fallback when WebGL cannot initialize.

The Quiet Editor has nine named action types and tier-level model fallback routing. Visual actions accept up to eight explicitly selected chapter images with a 12 MB combined sharing limit. The Worker verifies that every selected image belongs to the signed-in user and open chapter, excludes MP4, and sends image content only after the user checks the external-provider consent box. Text-only actions do not send chapter images.

## Operating principle

Story Loom should feel like owning a small fountain of remembered light: open when desired, enrich when useful, and never make the person calculate the price of looking back.
