import { createFileRoute } from '@tanstack/react-router'
import { appendCookies, createSession, json, loginUser, requireSameOrigin } from '../../../lib/server/auth'

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!requireSameOrigin(request)) return json({ error: 'Invalid request origin.' }, { status: 403 })
          const body = await request.json() as { username?: string; password?: string }
          const username = body.username?.trim().toLowerCase() ?? ''
          const user = await loginUser(username, body.password ?? '')
          if (!user) return json({ error: 'Username or password is incorrect.' }, { status: 401 })
          const session = await createSession(user.id)
          return appendCookies(json({ user }), request, [session.sessionCookie, session.csrfCookie])
        } catch {
          return json({ error: 'Could not sign in right now.' }, { status: 400 })
        }
      },
    },
  },
})
