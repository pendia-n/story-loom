import { createFileRoute } from '@tanstack/react-router'
import { createRecoveryReset, getRecoveryChallenge, getRecoveryUser, incrementRecoveryAttempts, json, requireSameOrigin, verifyRecoveryAnswer, verifyTotp } from '../../../../lib/server/auth'

export const Route = createFileRoute('/api/auth/recovery/verify')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!requireSameOrigin(request)) return json({ error: 'Invalid request origin.' }, { status: 403 })
        const body = await request.json() as { recoveryId?: string; code?: string; answer1?: string; answer2?: string }
        const challenge = await getRecoveryChallenge(body.recoveryId ?? '')
        if (!challenge || challenge.attempts >= 5) return json({ error: 'Recovery attempt expired or unavailable.' }, { status: 400 })
        const user = await getRecoveryUser((await getUserName(challenge.user_id)))
        if (!user) return json({ error: 'Recovery attempt unavailable.' }, { status: 400 })
        let valid = false
        if (challenge.method === 'totp' && user.totp_secret) valid = await verifyTotp(user.totp_secret, body.code ?? '')
        if (challenge.method === 'security' && user.security_answer_1_hash && user.security_answer_2_hash) {
          valid = Boolean(body.answer1 && body.answer2 && await verifyRecoveryAnswer(body.answer1, user.security_answer_1_hash) && await verifyRecoveryAnswer(body.answer2, user.security_answer_2_hash))
        }
        if (!valid) {
          await incrementRecoveryAttempts(challenge.id_hash)
          return json({ error: 'That recovery proof did not match.' }, { status: 401 })
        }
        return json({ resetToken: await createRecoveryReset(challenge.id_hash) })
      },
    },
  },
})

async function getUserName(userId: string) {
  const { getDatabase } = await import('../../../../lib/server/auth')
  const user = await getDatabase().prepare('SELECT username FROM users WHERE id = ?1').bind(userId).first<{ username: string }>()
  return user?.username ?? ''
}
