import { createFileRoute } from '@tanstack/react-router'
import { getCurrentUser, getDatabase, json, requireCsrf } from '../../lib/server/auth'

export const Route = createFileRoute('/api/chapters')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in to see your chapters.' }, { status: 401 })
        const chapters = await getDatabase().prepare(
          'SELECT id, title, subtitle, created_at, updated_at FROM chapters WHERE owner_id = ?1 ORDER BY updated_at DESC',
        ).bind(user.id).all()
        return json({ chapters: chapters.results })
      },
      POST: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in to create a chapter.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed. Refresh and try again.' }, { status: 403 })
        const body = await request.json() as { title?: string; subtitle?: string }
        const title = body.title?.trim().slice(0, 80) || 'A new chapter'
        const subtitle = body.subtitle?.trim().slice(0, 160) || 'A room for the moments worth keeping.'
        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        await getDatabase().prepare(
          'INSERT INTO chapters (id, owner_id, title, subtitle, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)',
        ).bind(id, user.id, title, subtitle, now).run()
        return json({ chapter: { id, title, subtitle, created_at: now, updated_at: now } }, { status: 201 })
      },
    },
  },
})
