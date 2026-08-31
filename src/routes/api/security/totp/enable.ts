import { createFileRoute } from '@tanstack/react-router'
import { getCurrentUser, getDatabase, json, requireCsrf, verifyTotp } from '../../../../lib/server/auth'

export const Route = createFileRoute('/api/security/totp/enable')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in first.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        const body = await request.json() as { code?: string }
        const row = await getDatabase().prepare('SELECT totp_pending_secret FROM users WHERE id = ?1').bind(user.id).first<{ totp_pending_secret: string | null }>()
        if (!row?.totp_pending_secret || !(await verifyTotp(row.totp_pending_secret, body.code ?? ''))) return json({ error: 'That authenticator code did not match.' }, { status: 400 })
        await getDatabase().prepare('UPDATE users SET totp_secret = totp_pending_secret, totp_pending_secret = NULL, totp_enabled = 1 WHERE id = ?1').bind(user.id).run()
        return json({ ok: true })
      },
    },
  },
})
