import { createFileRoute } from '@tanstack/react-router'
import { getCurrentUser, getDatabase, getMediaBucket, json, requireCsrf } from '../../../lib/server/auth'

export const Route = createFileRoute('/api/media/$mediaId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in to view this photo.' }, { status: 401 })
        const media = await getDatabase().prepare(
          'SELECT object_key, content_type, filename FROM media WHERE id = ?1 AND owner_id = ?2',
        ).bind(params.mediaId, user.id).first<{ object_key: string; content_type: string; filename: string }>()
        if (!media) return json({ error: 'Photo not found.' }, { status: 404 })
        const object = await getMediaBucket().get(media.object_key)
        if (!object) return json({ error: 'Photo is unavailable.' }, { status: 404 })
        return new Response(object.body, {
          headers: {
            'content-type': media.content_type,
            'cache-control': 'private, max-age=3600',
            'content-disposition': `inline; filename="${media.filename.replace(/[\r\n"]/g, '')}"`,
          },
        })
      },
      DELETE: async ({ request, params }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in to remove this photo.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        const db = getDatabase()
        const media = await db.prepare('SELECT object_key FROM media WHERE id = ?1 AND owner_id = ?2')
          .bind(params.mediaId, user.id).first<{ object_key: string }>()
        if (!media) return json({ error: 'Photo not found.' }, { status: 404 })
        await getMediaBucket().delete(media.object_key)
        await db.prepare('DELETE FROM media WHERE id = ?1 AND owner_id = ?2').bind(params.mediaId, user.id).run()
        return json({ ok: true })
      },
      PATCH: async ({ request, params }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in to edit this memory.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        const body = await request.json() as { caption?: string }
        if (typeof body.caption !== 'string') return json({ error: 'Write a caption to save.' }, { status: 400 })
        const caption = body.caption.trim().slice(0, 280)
        const result = await getDatabase().prepare('UPDATE media SET caption = ?1 WHERE id = ?2 AND owner_id = ?3').bind(caption, params.mediaId, user.id).run()
        if (!result.meta.changes) return json({ error: 'Memory not found.' }, { status: 404 })
        return json({ ok: true, caption })
      },
    },
  },
})
