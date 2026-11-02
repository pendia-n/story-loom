# Shaloom — a shareable product overview

Updated: 3 November 2026. Website: https://shaloom.space

This is a plain-language summary for sharing with another chat, collaborator, or potential partner. It describes the current product and separates implemented features from things that still need real-world verification. It is not a technical specification or a promise that every payment scenario has been tested.

## In one sentence

Shaloom turns a collection of pictures and videos into a walkable exhibition—a place to revisit your memories, present your artwork, or invite someone into a visual story.

## Why it exists

Some pictures deserve more than a place in a camera roll or another post in a feed. Shaloom gives them a space, their owner's words, and a reason for someone to slow down and look.

The experience is about creating, revisiting, and sharing an exhibition, not completing endless tasks after uploading. Walking through a finished collection is the main activity, much as enjoying a photobook or visiting an exhibition is an activity in itself.

Its intended emotional value is a “fountain”: an enjoyable place people want to return to, rather than a “tap” that charges for every ordinary action. Subscriptions pay for space and control; optional purchases expand capacity. There are no AI credits needed to browse, describe, or arrange a collection.

## Who it is for

- Artists and illustrators presenting a series, portfolio, or creative project.
- Comic creators who want visitors to follow their work in a chosen sequence; controlled ordering requires a paid plan.
- Individuals collecting a trip, life chapter, or personal milestone.
- Families and friends bringing photographs and memories together.

These are possible audiences, not evidence that demand or willingness to pay has already been established.

## What a user does

1. Try the public demo at `/demo`, without first creating a gallery.
2. Register with a username and password. New accounts start on Free. A recovery passcode can be set during registration or later.
3. Create a named collection, called a chapter.
4. Select supported media. Selecting more files adds them to the pending selection rather than replacing it. Remove unwanted files before uploading and give each item its own optional description.
5. Upload the selection. The app checks file types, file sizes, and remaining capacity. Image metadata cleansing is automatic.
6. Edit descriptions or remove individual items afterward. Paid members can rearrange uploaded items by dragging and dropping or using move buttons.
7. Enter the chapter as a walkable gallery, explore the work, and share the chapter link.
8. Find other members' public chapters through Spark.

## The gallery experience

The central experience is a room-like, walkable exhibition based on the supplied reference gallery—not a flat upload grid or a miniature slideshow.

- The gallery fills its page and has a separate fullscreen control, subject to browser support.
- On desktop, use arrow keys or WASD to walk and mouse controls to look around. Escape releases mouse capture.
- On mobile, drag to look and tap the floor to move.
- Select an artwork to read its description in a details panel.
- Supported MP4s can play on the painting itself, with playback controls; video is not limited to a separate pop-up player.
- Change the lighting between Dim, Lighter, Daylight, Twilight, and Party.
- Change the painting edge between Image edge, Wood, and Silver.
- Set artwork size to 100%, 110%, or 120%.
- Free chapters use randomized display. Paid chapters support saved, planned media order.

Lighting, edge, and size controls are currently viewing choices. Do not describe them as permanently saved chapter settings: the current gallery starts with its default look when opened again. Likewise, do not claim a measured percentage match to the reference gallery or perfect performance on every device.

## Plans and limits

Prices are in US dollars. Image and MP4 allowances are separate, per chapter.

| | Free | Standard | Zealous |
|---|---|---|---|
| Monthly price | $0 | $18 | $36 |
| Included chapters | 1 | 8 | 40 |
| Images per chapter | 25 | 50 | 100 |
| MP4s per chapter | 0 | 2 | 7 |
| Maximum size per file | 5 MB | 10 MB | 20 MB |
| Accepted uploads | PNG, JPG | PNG, JPG, GIF, MP4 | PNG, JPG, GIF, MP4 |
| Chapter visibility | Public only | Public or private | Public or private |
| Gallery order | Randomized | Planned ordering available | Planned ordering available |

The upload interface accepts JPEG pictures using the `.jpg` extension. There is currently no separate video-duration limit; the file-size and video-count limits still apply.

### Optional one-time capacity purchases

Available to paid members, not Free accounts:

| Purchase | Standard | Zealous |
|---|---|---|
| Extra chapter spaces — $5 | 10 additional chapters | 20 additional chapters |
| Extra media space for one selected chapter — $3 | 25 additional images and 3 MP4s | 75 additional images and 5 MP4s |

Media packs expand the selected chapter, not every chapter in the account. They do not raise the per-file size limit. Purchased chapter spaces are retained, and chapters created using those spaces have capacity associated with the tier under which the spaces were purchased.

## Sharing and discovery

“Public” means visible to signed-in members, not unrestricted anonymous browsing of members' galleries. The standalone demo is the exception.

- Free chapters are public to signed-in members.
- Paid members can make a chapter private.
- A visitor to a private chapter must sign in and enter the owner's eight-character code, made from letters, numbers, or both.
- Spark lists public chapters and provides title/creator search, media-type filters, collection-size filters, recent-date filters, sorting, and pagination.
- Spark supports images-only collections, collections with video, and collections with GIFs. It is not currently an AI recommendation feed.

## Accounts, recovery, and privacy

- Sign up and sign in with a username and password; no email recovery, security questions, or authenticator-code recovery.
- Users can change their username, with availability checking, and sign out.
- A recovery passcode is optional but necessary for password recovery while logged out. Recovery requires the username, then the passcode, then a new password. Losing the username or having no passcode means this recovery route cannot help.
- Signed-in users can change their password from their profile/security settings without entering the old password. Password changes are limited to once per 24 hours.
- Supported images are automatically checked and stripped of supported embedded metadata during upload. This is not an optional checkbox and is not a promise to remove identifying content visible in the picture itself.
- MP4 files are checked but not metadata-cleansed or rewritten by this upload process.

## Subscriptions, payments, and refunds

- Paid memberships use monthly recurring Checkout subscriptions and exclude cryptocurrency payment methods.
- One-time chapter and media purchases use Checkout and are configured to allow eligible card/fiat methods and USDC through Stripe. Whether USDC appears depends on Stripe eligibility and the customer's checkout circumstances.
- The implemented subscription refund rule is 50% of the latest eligible successful subscription payment, within 72 hours of that payment, accounting for any amount already refunded. It is not a full refund.
- One-time add-ons are non-refundable under the app's stated policy.
- Upgrading from Standard to Zealous charges the full Zealous price rather than refunding or crediting the Standard payment simply because of the upgrade.
- The implemented Zealous-to-Standard downgrade flow keeps Zealous through its paid period, then schedules one free Standard month before normal Standard renewal. This requires an active eligible Zealous subscription.

If paid membership ends, existing chapters and uploaded media are retained rather than automatically erased. Private chapters become public to signed-in members and their access codes are removed. Ordinary Free upload limits govern further uploads, with retained purchased-chapter capacity handled separately; do not simplify this into “all previously paid capacity stays active.”

These are implemented billing rules, not proof of completed live transactions. Live subscription purchases, renewals, tier changes, USDC presentation, and refunds have not been demonstrated by the checks recorded in this chat. Applicable consumer rights may also override a stated refund policy.

## AI and postcards

There is no current AI caption writer, title generator, life summary, scene organizer, AI postcard generator, or AI video generator in this product summary. Earlier discussions explored these ideas; they are not current features to advertise.

The product does not need AI to justify its core experience. Descriptions belong to the user, and enjoying the gallery should not depend on paid generation.

## Web and installed experience

Shaloom works as a website and includes support for an app-like installation on compatible browsers. That is not an App Store or Play Store release. Account access and gallery media still need an internet connection; a complete offline personal library is not promised. Installation behaviour and gallery smoothness should be verified on the actual target devices.

## Current status and boundaries for future work

The app has been deployed. The latest recorded release raised Free from eight to 25 images, updated the public wording, passed compilation/type checks and 15 existing automated tests, and preserved the existing website domains. That does not mean every user journey or payment has been tested end to end.

When discussing this project in another chat:

- Use Shaloom as the current product name; Story Loom was the earlier name.
- Treat this document as the current plain-language overview. The existing `APP.md` contains historical limits and implementation warnings that are no longer a reliable status summary.
- Preserve the walkable gallery experience rather than replacing it with an unrelated presentation.
- Do not reintroduce AI chores, generation quotas, postcard promises, obsolete eight-image Free limits, or anonymous access to member galleries without a new decision.
- Keep implemented functionality, intended emotional positioning, and unverified live behaviour clearly separate.

## Short introduction to reuse

Shaloom gives your pictures a place to be experienced, not just stored. Bring artwork, photographs, or a visual story into a chapter, add your own words, and invite someone to walk through it. Start with one public chapter and up to 25 pictures for free; paid plans add more space, private sharing, videos, and control over the viewing order.
