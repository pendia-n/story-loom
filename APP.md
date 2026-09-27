# Shaloom

## What it is

Shaloom is a web-first, installable personal gallery for arranging life moments into chapters and walking through them as a Three.js exhibition. A chapter holds the user's images, GIFs, videos, and descriptions; the gallery is the main experience, not an AI-generated summary of the user's life.

## Why it exists

Ordinary photo libraries are practical but often make meaningful collections feel like undifferentiated camera-roll inventory. Shaloom is intended to let someone shape a chapter—such as a trip, a creative project, or a family period—into a space they can revisit and share.

## The user problem

People who want to preserve and present visual stories need more than a chronological feed, but many gallery tools are designed for professional exhibitions or require technical configuration. Shaloom aims to make upload, ordering, descriptions, privacy, and revisiting a chapter understandable without editing code.

## How it should reduce stress

- Keep ordinary use free of repetitive AI chores and per-action charges.
- Make upload limits and remaining capacity visible before an upload fails.
- Clean privacy-related image metadata automatically; leave MP4 bytes unchanged.
- Keep existing chapters and media after a subscription downgrade, while applying the agreed upload and access limits.
- Make a chapter easy to enter, explore, and leave on both desktop and mobile.

## What makes it distinct

The core differentiator is a deterministic, user-curated, walkable 3D gallery for personal chapters, paired with simple account and sharing controls. The gallery should follow the supplied Three.js reference closely in navigation and presentation while keeping the user's chosen order stable for paid plans. AI-generated media is not part of the current core plan; adding a rare playful generation feature would require a separate product decision.

## Current product rules

- Plans are Free, Standard ($18/month), and Zealous ($36/month).
- Free includes one public chapter, up to eight PNG/JPG images, and randomized display. The current code assumes a 5 MB file limit; this still needs confirmation because the latest plan did not restate it.
- Standard includes eight chapters, up to 50 images and two MP4 videos per chapter, a 10 MB per-file limit, GIF support, private chapters, and planned ordering.
- Zealous includes 40 chapters, up to 100 images and seven MP4 videos per chapter, a 20 MB per-file limit, GIF support, private chapters, and planned ordering.
- Private chapters require the visitor to sign in and enter the owner's eight-character alphanumeric code.
- A private chapter becomes public and loses its code when the owner returns to Free; existing chapters and media are retained.
- Image metadata cleansing is mandatory on upload. MP4 files are not rewritten or metadata-cleansed.
- Current work adds touch-friendly order controls alongside desktop drag-and-drop.

## Implementation status

This is a product specification, not a claim that the live Worker is complete. The current source has not yet been deployed with the new D1 schema. The Worker currently has no JWT secret, and Stripe credentials and price IDs are not configured. The gallery's fidelity and PWA installation behavior still require live, non-localhost verification.
