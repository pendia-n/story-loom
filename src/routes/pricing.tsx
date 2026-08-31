import { createFileRoute } from '@tanstack/react-router'
import { PricingPage } from '../components/AccountPages'

export const Route = createFileRoute('/pricing')({ component: PricingPage })
