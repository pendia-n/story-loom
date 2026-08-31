import { createFileRoute } from '@tanstack/react-router'
import { getCurrentUser, getDatabase, getMediaBucket, json, requireCsrf } from '../../../lib/server/auth'

export const Route = createFileRoute('/api/chapters/$chapterId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in to open this chapter.' }, { status: 401 })
        const db = getDatabase()
        const chapter = await db.prepare(
          'SELECT id, title, subtitle, created_at, updated_at FROM chapters WHERE id = ?1 AND owner_id = ?2',
        ).bind(params.chapterId, user.id).first()
        if (!chapter) return json({ error: 'Chapter not found.' }, { status: 404 })
        const media = await db.prepare(
          'SELECT id, object_key, filename, content_type, byte_size, caption, sort_order, created_at FROM media WHERE chapter_id = ?1 AND owner_id = ?2 ORDER BY sort_order ASC, created_at ASC',
        ).bind(params.chapterId, user.id).all()
        return json({ chapter, media: media.results.map((item) => ({ ...item, url: `/api/media/${item.id}` })) })
      },
      DELETE: async ({ request, params }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in to delete this chapter.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        const db = getDatabase()
        const media = await db.prepare('SELECT object_key FROM media WHERE chapter_id = ?1 AND owner_id = ?2')
          .bind(params.chapterId, user.id).all<{ object_key: string }>()
        await Promise.all(media.results.map((item) => getMediaBucket().delete(item.object_key)))
        await db.prepare('DELETE FROM chapters WHERE id = ?1 AND owner_id = ?2').bind(params.chapterId, user.id).run()
        return json({ ok: true, deletedMedia: media.results.length })
      },
    },
  },
})
