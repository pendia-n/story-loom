import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import Footer from '../components/Footer'
import Header from '../components/Header'
import ServiceWorkerRegister from '../components/ServiceWorkerRegister'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Story Loom — Keep the glow of every chapter',
      },
      {
        name: 'description',
        content: 'A quiet, private 3D gallery for the moments worth keeping.',
      },
      {
        name: 'theme-color',
        content: '#091b17',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
      <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/story.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/story.svg" />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-[rgba(79,184,178,0.24)]">
        <Header />
        {children}
        <Footer />
        <ServiceWorkerRegister />
        <Scripts />
      </body>
    </html>
  )
}
