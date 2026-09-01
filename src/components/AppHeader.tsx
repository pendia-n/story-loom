import { Link } from '@tanstack/react-router'
import ThemeToggle from './ThemeToggle'

type IconName = 'rooms' | 'about' | 'faq' | 'pricing' | 'profile' | 'security' | 'signin' | 'signout'

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    rooms: <><path d="M3 5.5 12 2l9 3.5v13L12 22l-9-3.5z"/><path d="M12 2v20M3 5.5l9 3.7 9-3.7"/></>,
    about: <><circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 7h.01"/></>,
    faq: <><path d="M5 19.5 3.5 22l4.1-1.4A9 9 0 1 0 5 19.5Z"/><path d="M9.8 9a2.4 2.4 0 1 1 3.1 2.3c-.9.3-.9 1.1-.9 1.7M12 16h.01"/></>,
    pricing: <><path d="M3 7h18v12H3z"/><path d="M3 10h18M7 15h3"/></>,
    profile: <><circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/></>,
    security: <><path d="M12 2 5 5v6c0 5 3 8.5 7 11 4-2.5 7-6 7-11V5z"/><path d="m9 12 2 2 4-5"/></>,
    signin: <><path d="M14 4h5v16h-5M10 8l4 4-4 4M14 12H3"/></>,
    signout: <><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/></>,
  }
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

export default function AppHeader({ authenticated = false, username, onSignIn, onSignOut }: {
  authenticated?: boolean
  username?: string
  onSignIn?: () => void
  onSignOut?: () => void
}) {
  const nav = [
    ['/app', 'Rooms', 'rooms'], ['/about', 'About', 'about'], ['/faq', 'FAQ', 'faq'], ['/pricing', 'Pricing', 'pricing'],
  ] as const
  return <header className="loom-header">
    <Link className="wordmark" to="/" aria-label="Story Loom home"><img className="wordmark-logo" src="/story.svg" alt="" /><span className="wordmark-text">story loom</span></Link>
    <nav className="app-tabs" aria-label="Story Loom sections">
      {nav.map(([to, label, icon]) => <Link key={to} to={to}><NavIcon name={icon} /><span className="nav-label">{label}</span></Link>)}
      {authenticated && <><Link to="/profile"><NavIcon name="profile" /><span className="nav-label">Profile</span></Link><Link to="/security"><NavIcon name="security" /><span className="nav-label">Security</span></Link></>}
    </nav>
    <div className="header-actions">
      {username && <span className="header-status"><span className="status-dot" />@{username}</span>}
      <ThemeToggle />
      {onSignIn && <button className="button button-ghost header-auth" onClick={onSignIn} aria-label="Sign in"><NavIcon name="signin" /><span className="auth-label">Sign in</span></button>}
      {onSignOut && <button className="button button-ghost header-auth" onClick={onSignOut} aria-label="Sign out"><NavIcon name="signout" /><span className="auth-label">Sign out</span></button>}
    </div>
  </header>
}
