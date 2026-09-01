import { createFileRoute } from '@tanstack/react-router'
import { FaqPage } from '../components/AccountPages'

export const Route = createFileRoute('/faq')({ component: FaqPage })
