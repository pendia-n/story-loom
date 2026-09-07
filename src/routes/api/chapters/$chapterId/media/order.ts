import { createFileRoute } from '@tanstack/react-router'
import { getCurrentUser, getDatabase, json, requireCsrf } from '../../../../../lib/server/auth'

export const Route = createFileRoute('/api/chapters/$chapterId/media/order')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in to arrange this chapter.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        const body = await request.json() as { mediaIds?: string[] }
        const mediaIds = body.mediaIds ?? []
        if (mediaIds.length > 500 || new Set(mediaIds).size !== mediaIds.length || mediaIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
          return json({ error: 'Send each chapter item exactly once.' }, { status: 400 })
        }
        const db = getDatabase()
        const chapter = await db.prepare('SELECT id FROM chapters WHERE id = ?1 AND owner_id = ?2').bind(params.chapterId, user.id).first()
        if (!chapter) return json({ error: 'Chapter not found.' }, { status: 404 })
        const current = await db.prepare('SELECT id FROM media WHERE chapter_id = ?1 AND owner_id = ?2').bind(params.chapterId, user.id).all<{ id: string }>()
        const currentIds = new Set(current.results.map((item) => item.id))
        if (currentIds.size !== mediaIds.length || mediaIds.some((id) => !currentIds.has(id))) {
          return json({ error: 'The chapter changed. Refresh before arranging it again.' }, { status: 409 })
        }
        if (mediaIds.length) {
          await db.batch(mediaIds.map((id, index) => db.prepare('UPDATE media SET sort_order = ?1 WHERE id = ?2 AND chapter_id = ?3 AND owner_id = ?4').bind(index, id, params.chapterId, user.id)))
        }
        await db.prepare('UPDATE chapters SET updated_at = ?1 WHERE id = ?2 AND owner_id = ?3').bind(new Date().toISOString(), params.chapterId, user.id).run()
        return json({ ok: true, mediaIds })
      },
    },
  },
})
