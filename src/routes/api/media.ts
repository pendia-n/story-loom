import { createFileRoute } from '@tanstack/react-router'
import { getCurrentUser, getDatabase, getMediaBucket, json, requireCsrf } from '../../lib/server/auth'
import { cleanseImageMetadata, isLikelyMp4, mp4DurationSeconds } from '../../lib/server/media'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_VIDEO_BYTES = 25 * 1024 * 1024
const MAX_VIDEO_SECONDS = 30
const ALLOWED_TYPES = new Set(['image/png', 'image/webp', 'image/gif', 'video/mp4'])

export const Route = createFileRoute('/api/media')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in before adding memories.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed. Refresh and try again.' }, { status: 403 })
        const form = await request.formData()
        const chapterId = String(form.get('chapterId') ?? '')
        const file = form.get('file')
        const cleanRequested = String(form.get('cleanMetadata') ?? 'true') !== 'false'
        if (!(file instanceof File) || !ALLOWED_TYPES.has(file.type)) {
          return json({ error: 'Use a PNG, WebP, GIF, or MP4 file.' }, { status: 400 })
        }
        const limit = file.type === 'video/mp4' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
        if (file.size === 0 || file.size > limit) {
          return json({ error: file.type === 'video/mp4' ? 'Use an MP4 up to 25 MB.' : 'Use an image up to 5 MB.' }, { status: 400 })
        }
        const db = getDatabase()
        const chapter = await db.prepare('SELECT id FROM chapters WHERE id = ?1 AND owner_id = ?2').bind(chapterId, user.id).first()
        if (!chapter) return json({ error: 'Chapter not found.' }, { status: 404 })

        const originalBytes = new Uint8Array(await file.arrayBuffer())
        let storedBytes: Uint8Array<ArrayBufferLike> = originalBytes
        let metadataCleaned = 0
        let durationSeconds: number | null = null
        if (file.type === 'video/mp4') {
          if (!isLikelyMp4(originalBytes)) return json({ error: 'That file is not a valid MP4.' }, { status: 400 })
          durationSeconds = mp4DurationSeconds(originalBytes)
          if (durationSeconds === null || durationSeconds <= 0 || durationSeconds > MAX_VIDEO_SECONDS) {
            return json({ error: 'MP4 clips must be between 1 and 30 seconds.' }, { status: 400 })
          }
        } else if (cleanRequested) {
          const cleaned = cleanseImageMetadata(originalBytes, file.type)
          storedBytes = cleaned.bytes
          metadataCleaned = cleaned.cleaned ? 1 : 0
        }

        const id = crypto.randomUUID()
        const objectKey = `${user.id}/${chapterId}/${id}`
        await getMediaBucket().put(objectKey, storedBytes, {
          httpMetadata: { contentType: file.type, cacheControl: 'private, max-age=3600' },
          customMetadata: { filename: file.name.slice(0, 160), metadataCleaned: String(metadataCleaned) },
        })
        const order = await db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM media WHERE chapter_id = ?1')
          .bind(chapterId).first<{ next_order: number }>()
        await db.prepare(
          'INSERT INTO media (id, chapter_id, owner_id, object_key, filename, content_type, byte_size, duration_seconds, caption, sort_order, metadata_cleaned, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)',
        ).bind(id, chapterId, user.id, objectKey, file.name.slice(0, 160), file.type, storedBytes.byteLength, durationSeconds, '', order?.next_order ?? 0, metadataCleaned, new Date().toISOString()).run()
        return json({ media: { id, filename: file.name, content_type: file.type, byte_size: storedBytes.byteLength, duration_seconds: durationSeconds, metadata_cleaned: metadataCleaned, url: `/api/media/${id}` } }, { status: 201 })
      },
    },
  },
})
