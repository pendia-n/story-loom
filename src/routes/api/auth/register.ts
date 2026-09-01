import { createFileRoute } from '@tanstack/react-router'
import { appendCookies, createSession, json, passwordValidationError, registerUser, requireSameOrigin, verifyTotp } from '../../../lib/server/auth'

export const Route = createFileRoute('/api/auth/register')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!requireSameOrigin(request)) return json({ error: 'Invalid request origin.' }, { status: 403 })
          const body = await request.json() as { username?: string; password?: string; totpSecret?: string; totpCode?: string }
          const username = body.username?.trim().toLowerCase() ?? ''
          const password = body.password ?? ''
          if (!/^[a-z0-9_]{3,24}$/.test(username)) {
            return json({ error: 'Use 3–24 lowercase letters, numbers, or underscores.' }, { status: 400 })
          }
          const passwordError = passwordValidationError(password)
          if (passwordError) return json({ error: passwordError }, { status: 400 })
          const totpSecret = body.totpSecret?.trim().toUpperCase() ?? ''
          const totpCode = body.totpCode?.trim() ?? ''
          if (totpSecret || totpCode) {
            if (!/^[A-Z2-7]{32}$/.test(totpSecret) || !/^\d{6}$/.test(totpCode)) {
              return json({ error: 'Prepare your authenticator and enter its six-digit code before creating the account.' }, { status: 400 })
            }
            if (!(await verifyTotp(totpSecret, totpCode))) {
              return json({ error: 'That authenticator code did not match.' }, { status: 400 })
            }
          }
          const user = await registerUser(username, password, totpSecret || undefined)
          const session = await createSession(user.id)
          return appendCookies(json({ user }), request, [session.sessionCookie, session.csrfCookie])
        } catch (error) {
          console.error('Registration failed', error)
          const message = error instanceof Error && error.message.includes('UNIQUE')
            ? 'That username is already taken.' : 'Could not create the account.'
          return json({ error: message }, { status: 400 })
        }
      },
    },
  },
})
