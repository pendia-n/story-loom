import { createFileRoute } from '@tanstack/react-router'
import { SecurityPage } from '../components/AccountPages'

export const Route = createFileRoute('/security')({ component: SecurityPage })
