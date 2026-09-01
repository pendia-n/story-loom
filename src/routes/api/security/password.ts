import { createFileRoute } from '@tanstack/react-router'
import { changePassword, getCurrentUser, json, passwordValidationError, requireCsrf } from '../../../lib/server/auth'

export const Route = createFileRoute('/api/security/password')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in first.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        const body = await request.json() as { password?: string }
        const password = body.password ?? ''
        const passwordError = passwordValidationError(password)
        if (passwordError) return json({ error: passwordError }, { status: 400 })
        await changePassword(user.id, password)
        return json({ ok: true })
      },
    },
  },
})
