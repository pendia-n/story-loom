import { createFileRoute } from '@tanstack/react-router'
import { json } from '../../lib/server/auth'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () => json({ ok: true, service: 'story-loom', version: '1' }),
    },
  },
})
