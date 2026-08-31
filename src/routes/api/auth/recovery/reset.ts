import { createFileRoute } from '@tanstack/react-router'
import { appendCookies, changePassword, consumeRecoveryReset, createSession, getDatabase, json, requireSameOrigin } from '../../../../lib/server/auth'

export const Route = createFileRoute('/api/auth/recovery/reset')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!requireSameOrigin(request)) return json({ error: 'Invalid request origin.' }, { status: 403 })
        const body = await request.json() as { resetToken?: string; password?: string }
        if (!body.password || body.password.length < 10) return json({ error: 'Use a password with at least 10 characters.' }, { status: 400 })
        const userId = await consumeRecoveryReset(body.resetToken ?? '')
        if (!userId) return json({ error: 'That recovery link has expired.' }, { status: 400 })
        await changePassword(userId, body.password)
        await getDatabase().prepare('DELETE FROM sessions WHERE user_id = ?1').bind(userId).run()
        const session = await createSession(userId)
        const user = await getDatabase().prepare('SELECT id, username, created_at FROM users WHERE id = ?1').bind(userId).first()
        return appendCookies(json({ user }), request, [session.sessionCookie, session.csrfCookie])
      },
    },
  },
})
