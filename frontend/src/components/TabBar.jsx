import { NavLink } from 'react-router-dom'
import './TabBar.css'

function LinkIcon() {
  return (
    <svg className="tab-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg className="tab-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  )
}

function BookmarkIcon() {
  return (
    <svg className="tab-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
    </svg>
  )
}

const TABS = [
  { to: '/scrape', label: 'Scrape', Icon: LinkIcon },
  { to: '/search', label: 'Search', Icon: SearchIcon },
  { to: '/saved',  label: 'Saved',  Icon: BookmarkIcon },
]

export function TabBar() {
  return (
    <nav className="tab-bar" aria-label="Main navigation">
      <div className="tab-bar__brand" aria-hidden="true">
        <span className="tab-bar__brand-name">Recipe</span>
        <span className="tab-bar__brand-sub">Scraper</span>
      </div>
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `tab-item${isActive ? ' tab-item--active' : ''}`
          }
        >
          <Icon />
          <span className="tab-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
