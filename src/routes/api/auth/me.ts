import { createFileRoute } from '@tanstack/react-router'
import { getCurrentUser, json } from '../../../lib/server/auth'

export const Route = createFileRoute('/api/auth/me')({
  server: {
    handlers: {
      GET: async ({ request }) => json({ user: await getCurrentUser(request) }),
    },
  },
})
