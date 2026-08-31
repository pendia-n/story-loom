import { createFileRoute } from '@tanstack/react-router'
import { changePassword, getCurrentUser, json, requireCsrf } from '../../../lib/server/auth'

export const Route = createFileRoute('/api/security/password')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in first.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        const body = await request.json() as { password?: string }
        if (!body.password || body.password.length < 10) return json({ error: 'Use a password with at least 10 characters.' }, { status: 400 })
        await changePassword(user.id, body.password)
        return json({ ok: true })
      },
    },
  },
})
