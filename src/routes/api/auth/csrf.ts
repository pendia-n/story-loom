import { createFileRoute } from '@tanstack/react-router'
import { getCurrentUser, getCsrfToken, json } from '../../../lib/server/auth'

export const Route = createFileRoute('/api/auth/csrf')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await getCurrentUser(request))) return json({ error: 'Sign in first.' }, { status: 401 })
        return json({ csrfToken: getCsrfToken(request) })
      },
    },
  },
})
