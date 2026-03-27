import { NavLink, Outlet } from 'react-router-dom'
import { useState, useEffect } from 'react'

interface LayoutProps {
  lastUpdated: Date | null
}

const navItems = [
  { to: '/', label: 'Dashboard', icon: '◉' },
  { to: '/sessions', label: 'Sessions', icon: '◎' },
  { to: '/providers', label: 'Providers', icon: '⬡' },
  { to: '/mcp-servers', label: 'MCP Servers', icon: '⬢' },
  { to: '/skills', label: 'Skills', icon: '✦' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

export default function Layout({ lastUpdated }: LayoutProps) {
  const [ago, setAgo] = useState('')

  useEffect(() => {
    const update = () => {
      if (!lastUpdated) {
        setAgo('')
        return
      }
      const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000)
      setAgo(`${seconds}s ago`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [lastUpdated])

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">⚡</span>
          <span className="brand-text">async-agents</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `nav-link ${isActive ? 'nav-link-active' : ''}`
              }
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        <header className="top-bar">
          <div className="top-bar-spacer" />
          {ago && (
            <span className="last-updated">Last updated: {ago}</span>
          )}
        </header>
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
