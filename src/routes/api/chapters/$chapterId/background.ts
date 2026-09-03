import { createFileRoute } from '@tanstack/react-router'
import { getCurrentUser, getDatabase, getMediaBucket, json, requireCsrf } from '../../../../lib/server/auth'
import { cleanseImageMetadata, isLikelyImage } from '../../../../lib/server/media'
import { getUserTier } from '../../../../lib/server/limits'

const MAX_BACKGROUND_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/png', 'image/webp', 'image/gif'])
const MODES = new Set(['morning', 'night', 'twilight', 'afternoon', 'sunrise'])

export const Route = createFileRoute('/api/chapters/$chapterId/background')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in to view this background.' }, { status: 401 })
        const chapter = await getDatabase().prepare('SELECT background_object_key FROM chapters WHERE id = ?1 AND owner_id = ?2')
          .bind(params.chapterId, user.id).first<{ background_object_key: string | null }>()
        if (!chapter?.background_object_key) return json({ error: 'No custom background.' }, { status: 404 })
        const object = await getMediaBucket().get(chapter.background_object_key)
        if (!object) return json({ error: 'Background is unavailable.' }, { status: 404 })
        return new Response(object.body, { headers: { 'content-type': object.httpMetadata?.contentType ?? 'image/png', 'cache-control': 'private, max-age=3600' } })
      },
      PUT: async ({ request, params }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in to change this background.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        const tier = await getUserTier(user.id)
        const body = await request.json() as { mode?: string }
        if (!body.mode || !MODES.has(body.mode)) return json({ error: 'Choose a valid atmosphere.' }, { status: 400 })
        if (tier === 'free' && !new Set(['morning', 'night', 'afternoon']).has(body.mode)) return json({ error: 'This atmosphere is available on Memory and Studio.' }, { status: 402 })
        const result = await getDatabase().prepare('UPDATE chapters SET background_mode = ?1, updated_at = ?2 WHERE id = ?3 AND owner_id = ?4')
          .bind(body.mode, new Date().toISOString(), params.chapterId, user.id).run()
        if (!result.meta.changes) return json({ error: 'Chapter not found.' }, { status: 404 })
        return json({ ok: true, mode: body.mode })
      },
      POST: async ({ request, params }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in to add a background.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        if (await getUserTier(user.id) !== 'studio') return json({ error: 'Custom backgrounds require Studio.' }, { status: 402 })
        const form = await request.formData()
        const file = form.get('file')
        if (!(file instanceof File) || !ALLOWED_TYPES.has(file.type)) return json({ error: 'Use a PNG, WebP, or GIF background.' }, { status: 400 })
        if (file.size === 0 || file.size > MAX_BACKGROUND_BYTES) return json({ error: 'Use an image up to 5 MB.' }, { status: 400 })
        const db = getDatabase()
        const chapter = await db.prepare('SELECT background_object_key FROM chapters WHERE id = ?1 AND owner_id = ?2')
          .bind(params.chapterId, user.id).first<{ background_object_key: string | null }>()
        if (!chapter) return json({ error: 'Chapter not found.' }, { status: 404 })
        const original = new Uint8Array(await file.arrayBuffer())
        if (!isLikelyImage(original, file.type)) return json({ error: 'The image bytes do not match PNG, WebP, or GIF.' }, { status: 400 })
        const cleaned = cleanseImageMetadata(original, file.type)
        const objectKey = `${user.id}/${params.chapterId}/background-${crypto.randomUUID()}`
        await getMediaBucket().put(objectKey, cleaned.bytes, { httpMetadata: { contentType: file.type, cacheControl: 'private, max-age=3600' }, customMetadata: { filename: 'chapter-background', metadataCleaned: String(cleaned.cleaned) } })
        await db.prepare('UPDATE chapters SET background_object_key = ?1, updated_at = ?2 WHERE id = ?3 AND owner_id = ?4')
          .bind(objectKey, new Date().toISOString(), params.chapterId, user.id).run()
        if (chapter.background_object_key) await getMediaBucket().delete(chapter.background_object_key)
        return json({ ok: true, url: `/api/chapters/${params.chapterId}/background`, metadata_cleaned: cleaned.cleaned })
      },
      DELETE: async ({ request, params }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in to remove this background.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        const db = getDatabase()
        const chapter = await db.prepare('SELECT background_object_key FROM chapters WHERE id = ?1 AND owner_id = ?2')
          .bind(params.chapterId, user.id).first<{ background_object_key: string | null }>()
        if (!chapter) return json({ error: 'Chapter not found.' }, { status: 404 })
        await db.prepare("UPDATE chapters SET background_object_key = NULL, background_mode = 'night', updated_at = ?1 WHERE id = ?2 AND owner_id = ?3")
          .bind(new Date().toISOString(), params.chapterId, user.id).run()
        if (chapter.background_object_key) await getMediaBucket().delete(chapter.background_object_key)
        return json({ ok: true, mode: 'night' })
      },
    },
  },
})
