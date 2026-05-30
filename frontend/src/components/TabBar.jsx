import { NavLink } from 'react-router-dom'
import './TabBar.css'

const TABS = [
  { to: '/scrape', label: 'Scrape', icon: '🔗' },
  { to: '/search', label: 'Search', icon: '🔍' },
  { to: '/saved',  label: 'Saved',  icon: '⭐' },
]

export function TabBar() {
  return (
    <nav className="tab-bar" aria-label="Main navigation">
      {TABS.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `tab-item${isActive ? ' tab-item--active' : ''}`
          }
        >
          <span className="tab-icon" aria-hidden="true">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
