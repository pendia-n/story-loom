import { createFileRoute } from '@tanstack/react-router'
import { getCurrentUser, getDatabase, json, makeTotpSecret, makeTotpUri, requireCsrf } from '../../../../lib/server/auth'

export const Route = createFileRoute('/api/security/totp/setup')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in first.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        const secret = makeTotpSecret()
        await getDatabase().prepare('UPDATE users SET totp_pending_secret = ?1 WHERE id = ?2').bind(secret, user.id).run()
        return json({ secret, uri: makeTotpUri(user.username, secret) })
      },
    },
  },
})
