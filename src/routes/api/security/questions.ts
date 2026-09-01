import { createFileRoute } from '@tanstack/react-router'
import { getCurrentUser, getDatabase, hashRecoveryAnswer, json, requireCsrf, verifyRecoveryAnswer } from '../../../lib/server/auth'
import { isSecurityQuestion } from '../../../lib/security-questions'

export const Route = createFileRoute('/api/security/questions')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in first.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        const body = await request.json() as { slot?: 1 | 2; question?: string; answer?: string; question1?: string; answer1?: string; question2?: string; answer2?: string }
        if (body.slot === 1 || body.slot === 2) {
          const row = await getDatabase().prepare('SELECT security_question_1, security_answer_1_hash, security_question_2, security_answer_2_hash FROM users WHERE id = ?1').bind(user.id).first<{
            security_question_1: string | null; security_answer_1_hash: string | null; security_question_2: string | null; security_answer_2_hash: string | null
          }>()
          const question = body.question?.trim() ?? ''
          const answer = body.answer?.trim() ?? ''
          if (!isSecurityQuestion(question)) return json({ error: 'Choose a question from the list.' }, { status: 400 })
          const otherQuestion = body.slot === 1 ? row?.security_question_2 : row?.security_question_1
          const otherHash = body.slot === 1 ? row?.security_answer_2_hash : row?.security_answer_1_hash
          const ownHash = body.slot === 1 ? row?.security_answer_1_hash : row?.security_answer_2_hash
          if (question === otherQuestion) return json({ error: 'Choose two different questions.' }, { status: 400 })
          if (!answer && !ownHash) return json({ error: 'Add an answer with at least three characters.' }, { status: 400 })
          if (answer && answer.length < 3) return json({ error: 'Add an answer with at least three characters.' }, { status: 400 })
          if (answer && otherHash && await verifyRecoveryAnswer(answer, otherHash)) return json({ error: 'The two answers must be different.' }, { status: 400 })
          const hash = answer ? await hashRecoveryAnswer(answer) : ownHash
          const questionColumn = body.slot === 1 ? 'security_question_1' : 'security_question_2'
          const answerColumn = body.slot === 1 ? 'security_answer_1_hash' : 'security_answer_2_hash'
          await getDatabase().prepare(`UPDATE users SET ${questionColumn} = ?1, ${answerColumn} = ?2 WHERE id = ?3`).bind(question, hash, user.id).run()
          return json({ ok: true })
        }
        const question1 = body.question1?.trim().slice(0, 160) ?? ''
        const question2 = body.question2?.trim().slice(0, 160) ?? ''
        const answer1 = body.answer1?.trim() ?? ''
        const answer2 = body.answer2?.trim() ?? ''
        if (!isSecurityQuestion(question1) || !isSecurityQuestion(question2) || answer1.length < 3 || answer2.length < 3) return json({ error: 'Choose two listed questions and add two answers.' }, { status: 400 })
        if (question1 === question2) return json({ error: 'Choose two different questions.' }, { status: 400 })
        if (answer1.toLocaleLowerCase() === answer2.toLocaleLowerCase()) return json({ error: 'The two answers must be different.' }, { status: 400 })
        await getDatabase().prepare('UPDATE users SET security_question_1 = ?1, security_answer_1_hash = ?2, security_question_2 = ?3, security_answer_2_hash = ?4 WHERE id = ?5')
          .bind(question1, await hashRecoveryAnswer(answer1), question2, await hashRecoveryAnswer(answer2), user.id).run()
        return json({ ok: true })
      },
      DELETE: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in first.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        await getDatabase().prepare('UPDATE users SET security_question_1 = NULL, security_answer_1_hash = NULL, security_question_2 = NULL, security_answer_2_hash = NULL WHERE id = ?1').bind(user.id).run()
        return json({ ok: true })
      },
    },
  },
})
