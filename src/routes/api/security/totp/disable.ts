import { createFileRoute } from '@tanstack/react-router'
import { getCurrentUser, getDatabase, json, requireCsrf, verifyTotp } from '../../../../lib/server/auth'

export const Route = createFileRoute('/api/security/totp/disable')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in first.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        const body = await request.json() as { code?: string }
        const row = await getDatabase().prepare('SELECT totp_secret FROM users WHERE id = ?1').bind(user.id).first<{ totp_secret: string | null }>()
        if (row?.totp_secret && !(await verifyTotp(row.totp_secret, body.code ?? ''))) return json({ error: 'Enter a current authenticator code to disable TOTP.' }, { status: 400 })
        await getDatabase().prepare('UPDATE users SET totp_secret = NULL, totp_pending_secret = NULL, totp_enabled = 0 WHERE id = ?1').bind(user.id).run()
        return json({ ok: true })
      },
    },
  },
})
