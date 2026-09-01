export const SECURITY_QUESTIONS = [
  'What was the name of a street you remember from childhood?',
  'What was the first book you chose for yourself?',
  'What nickname did a close friend use for you?',
  'What was the name of your first pet?',
  'What meal reminds you most of home?',
  'What was the first concert or performance you attended?',
  'What was the name of your childhood school?',
  'What object did you keep for sentimental reasons?',
  'What place did your family visit repeatedly?',
  'What was the first game you loved?',
  'What teacher’s surname do you remember best?',
  'What was the name of a childhood imaginary character?',
  'What was the first city you travelled to alone?',
  'What song reminds you of an important year?',
  'What was the name of a favourite local shop?',
] as const

export function isSecurityQuestion(value: string) {
  return (SECURITY_QUESTIONS as readonly string[]).includes(value)
}
