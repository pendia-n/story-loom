import { createFileRoute } from '@tanstack/react-router'
import { appendCookies, clearSessionCookies, deleteCurrentSession, getCurrentUser, json, requireCsrf } from '../../../lib/server/auth'

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (await getCurrentUser(request) && !(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        await deleteCurrentSession(request)
        return appendCookies(json({ ok: true }), request, clearSessionCookies())
      },
    },
  },
})
