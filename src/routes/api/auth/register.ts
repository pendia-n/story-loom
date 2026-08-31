import { createFileRoute } from '@tanstack/react-router'
import { appendCookies, createSession, json, registerUser, requireSameOrigin } from '../../../lib/server/auth'

export const Route = createFileRoute('/api/auth/register')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!requireSameOrigin(request)) return json({ error: 'Invalid request origin.' }, { status: 403 })
          const body = await request.json() as { username?: string; password?: string }
          const username = body.username?.trim().toLowerCase() ?? ''
          const password = body.password ?? ''
          if (!/^[a-z0-9_]{3,24}$/.test(username)) {
            return json({ error: 'Use 3–24 lowercase letters, numbers, or underscores.' }, { status: 400 })
          }
          if (password.length < 10) return json({ error: 'Use a password with at least 10 characters.' }, { status: 400 })
          const user = await registerUser(username, password)
          const session = await createSession(user.id)
          return appendCookies(json({ user }), request, [session.sessionCookie, session.csrfCookie])
        } catch (error) {
          const message = error instanceof Error && error.message.includes('UNIQUE')
            ? 'That username is already taken.' : 'Could not create the account.'
          return json({ error: message }, { status: 400 })
        }
      },
    },
  },
})
