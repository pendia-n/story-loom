import { createFileRoute } from '@tanstack/react-router'
import StoryLoomApp from '../../components/StoryLoomApp'

export const Route = createFileRoute('/chapters/$chapterId')({ component: ChapterRoute })

function ChapterRoute() {
  const { chapterId } = Route.useParams()
  return <StoryLoomApp initialChapterId={chapterId} />
}
