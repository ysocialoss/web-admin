import { moderationPath } from './moderationRoutes'
import { useAdminOverview, useOpenReportCount } from './adminApi'
import { AdminConnection } from './AdminConnection'
import { useAdminSession } from './useAdminSession'
import { useEffect, useState } from 'react'
import {
  Alignment,
  Button,
  Card,
  Classes,
  InputGroup,
  Menu,
  MenuDivider,
  MenuItem,
  Navbar,
  PopoverNext,
} from '@blueprintjs/core'
import type { IconName } from '@blueprintjs/icons'
import Overview, { OverviewLoading } from './Overview'
import UserAvatar from './UserAvatar'
import { LoadingStatus } from './LoadingState'
import Users from './Users'
import Moderation from './Moderation'
import ContentReview from './ContentReview'
import Activity from './Activity'
import System from './System'
import Flags from './Flags'
import Reports from './Reports'
import Waitlist from './Waitlist'
import type { ModerationTarget } from './Moderation'

const sections = [
  { id: 'overview', title: 'Overview', icon: 'dashboard', path: '/' },
  { id: 'reports', title: 'Reports', icon: 'warning-sign', path: '/reports' },
  { id: 'moderation', title: 'Content review', icon: 'shield', path: '/moderation' },
  { id: 'flags', title: 'Flags', icon: 'flag', path: '/flags' },
  { id: 'users', title: 'Users', icon: 'people', path: '/users' },
  { id: 'waitlist', title: 'Waitlist', icon: 'time', path: '/waitlist' },
  { id: 'activity', title: 'Activity history', icon: 'history', path: '/activity' },
  { id: 'system', title: 'System status', icon: 'pulse', path: '/system' },
] satisfies { id: string; title: string; icon: IconName; path: string }[]

function ConnectedApp({ onSignOut, onAccessLost, signingOut }: { onSignOut: () => void; onAccessLost: () => void; signingOut: boolean }) {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search)
  const [pathname] = location.split('?')
  const [notice, setNotice] = useState('')
  const [reportRevision, setReportRevision] = useState(0)
  const openReports = useOpenReportCount(onAccessLost, reportRevision)
  const activeSection = sections.find((section) => pathname.split('/')[1] === section.id) ?? sections[0]
  const activeNav = /^\/moderation\/user\//i.test(pathname) ? 'users' : activeSection.id
  const overview = useAdminOverview(activeSection.id === 'overview' ? null : '', onAccessLost)
  const result = useAdminOverview(search, onAccessLost)
  const { recentPosts, recentUsers } = result.data
  const contentType = /^\/moderation\/(post|reply)\/?$/.exec(pathname)?.[1] ?? 'all'
  const isDetail = /^\/moderation\/(user|post)\/[^/]+\/?$/i.test(pathname)
  const previous: unknown = window.history.state?.returnTrail
  const returnTrail = Array.isArray(previous)
    ? previous.filter((path): path is string => typeof path === 'string' && /^\/(?!\/|\\)/.test(path))
    : []
  const returnTo = returnTrail.at(0)

  function navigate(path: string, keepCurrentAsParent = false) {
    const [nextPath] = path.split('?')
    const current = window.location.pathname + window.location.search
    if (current !== path) {
      const openingDetail = /^\/moderation\/(user|post)\/[^/]+\/?$/i.test(nextPath)
      const trail = path === returnTo ? returnTrail.slice(1)
        : keepCurrentAsParent || !isDetail ? [current, ...returnTrail] : returnTrail
      window.history.pushState(openingDetail ? { returnTrail: trail } : null, '', path)
    }
    setLocation(path)
    setSearchOpen(false)
    setNotice('')
  }

  useEffect(() => {
    const handlePopState = () => { setLocation(window.location.pathname + window.location.search); setSearchOpen(false); setNotice('') }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])
  const matchingUsers = result.loading || result.error ? [] : recentUsers
  const matchingPosts = result.loading || result.error ? [] : recentPosts

  function openResult(target: ModerationTarget) {
    navigate(moderationPath(target))
    setSearchOpen(false)
  }
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const savedTheme = localStorage.getItem('ysocial-admin-theme')
      if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme === 'dark'
    } catch {
      // Use the system preference when browser storage is unavailable.
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.body.classList.toggle(Classes.DARK, darkMode)
    document.body.style.backgroundColor = 'var(--bp-surface-background-color-default-rest)'
    try {
      localStorage.setItem('ysocial-admin-theme', darkMode ? 'dark' : 'light')
    } catch {
      // The toggle still works when browser storage is unavailable.
    }
  }, [darkMode])

  return (
    <>
      <Navbar className="admin-navbar" aria-label="Moderation toolbar">
        <Navbar.Group>
          <Navbar.Heading>
            <img src="/logo.png" width="85" height="32" alt="Ysocial" />
          </Navbar.Heading>
        </Navbar.Group>
        <Navbar.Group align={Alignment.RIGHT}>
          <Button
            variant="minimal"
            icon={darkMode ? 'moon' : 'flash'}
            aria-label="Dark mode"
            aria-pressed={darkMode}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setDarkMode((enabled) => !enabled)}
          />
          <Button variant="minimal" icon="log-out" aria-label="Sign out" onClick={onSignOut} loading={signingOut}>Sign out</Button>
        </Navbar.Group>
        <PopoverNext
          className="admin-search"
          placement="bottom-end"
          isOpen={searchOpen && search.length > 0}
          onInteraction={(open) => setSearchOpen(open && searchInput.trim() === search)}
          autoFocus={false}
          enforceFocus={false}
          shouldReturnFocusOnClose={false}
          content={
            <Menu aria-label="Search results">
              {matchingUsers.length > 0 && <MenuDivider title="Users" />}
              {matchingUsers.map((user) => <MenuItem key={user.handle} icon={<UserAvatar src={user.avatarUrl} />} text={user.name || user.handle} label={user.handle}
                onClick={() => openResult({ kind: 'user', id: user.id })} />)}
              {matchingPosts.length > 0 && <MenuDivider title="Posts" />}
              {matchingPosts.map((post) => <MenuItem key={post.id} icon={post.gif || post.imageIds.length ? 'media' : post.voiceUrl ? 'volume-up' : 'document'}
                text={post.content || post.gif?.title || (post.imageIds.length ? 'Image attachment' : post.voiceUrl ? 'Voice message' : post.kind)} label={post.author}
                onClick={() => openResult({ kind: 'post', id: post.id })} />)}
              {result.loading && <li className="admin-search-status"><LoadingStatus label="Searching…" /></li>}
              {result.error && <>
                <li className="admin-search-status" role="alert">{result.error}</li>
                <MenuItem text="Retry search" icon="refresh" shouldDismissPopover={false} onClick={result.refresh} />
              </>}
              {!result.loading && !result.error && matchingUsers.length === 0 && matchingPosts.length === 0 && <MenuItem disabled text="No results found" />}
            </Menu>
          }
        >
          <InputGroup leftIcon="search" placeholder="Search users and posts…" aria-label="Search users and posts" type="search"
            value={searchInput}
            maxLength={255}
            onChange={(event) => {
              setSearchInput(event.currentTarget.value)
              setSearchOpen(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSearchOpen(false)
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
              event.preventDefault()
              const submitted = searchInput.trim()
              if (submitted === search) result.refresh()
              else setSearch(submitted)
              setSearchOpen(Boolean(submitted))
            }}
          />
        </PopoverNext>
      </Navbar>
      <div className="admin-workspace">
      <nav className="admin-sidebar" aria-label="Moderation workspace">
        <Menu>
          {sections.map(section => <MenuItem key={section.id} icon={section.icon} text={section.title}
            label={section.id === 'reports' && openReports ? String(openReports) : undefined}
            active={activeNav === section.id} aria-current={activeNav === section.id ? 'page' : undefined}
            href={section.path} onClick={event => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
              event.preventDefault()
              navigate(section.path)
            }} />)}
        </Menu>
      </nav>
      <main className="admin-main">
        {activeSection.id === 'overview' && (overview.loading
          ? <OverviewLoading />
          : overview.error
            ? <section className="overview">
                <header className="overview-heading"><h1 className={Classes.HEADING}>Overview</h1></header>
                <Card><p role="alert">{overview.error}</p><Button onClick={overview.refresh}>Retry</Button></Card>
              </section>
            : <Overview data={overview.data} onOpenModeration={openResult} onNavigate={navigate} onRefresh={overview.refresh} onAccessLost={onAccessLost} />)}
        {activeSection.id === 'users' && <Users onAccessLost={onAccessLost} onOpenUser={id => navigate('/moderation/user/' + id)} />}
        {activeSection.id === 'waitlist' && <Waitlist onAccessLost={onAccessLost} onOpenUser={id => navigate('/moderation/user/' + id)} />}
        {activeSection.id === 'reports' && <Reports pathname={pathname} onNavigate={navigate} onAccessLost={onAccessLost}
          onChanged={() => setReportRevision(value => value + 1)}
          onOpenUser={id => navigate('/moderation/user/' + id, true)} onOpenPost={id => navigate('/moderation/post/' + id, true)} />}
        {activeSection.id === 'flags' && <Flags onAccessLost={onAccessLost} onOpenUser={id => navigate('/moderation/user/' + id)} />}
        {activeSection.id === 'system' && <System onAccessLost={onAccessLost} />}
        {activeSection.id === 'activity' && <Activity onAccessLost={onAccessLost}
          onOpenUser={id => navigate('/moderation/user/' + id)} onOpenPost={id => navigate('/moderation/post/' + id)} />}
        {activeSection.id === 'moderation' && (isDetail
          ? <Moderation key={location} onAccessLost={onAccessLost} pathname={pathname} onNavigate={navigate}
              returnTo={returnTo} navigationNotice={notice}
              onOpenProfilePost={id => navigate('/moderation/post/' + id, true)}
              onRemoved={() => {
                const profileReturn = returnTo && /^\/moderation\/user\/[0-9a-f-]+\/?(?:\?|$)/i.test(returnTo)
                const listReturn = returnTo && /^\/moderation(?:\/(?:post|reply))?(?:\?|$)/.test(returnTo)
                navigate(profileReturn || listReturn ? returnTo : '/moderation')
                setNotice('Content removed.')
              }} />
          : <ContentReview key={location} type={contentType} onAccessLost={onAccessLost} notice={notice}
              onType={type => {
                const params = new URLSearchParams(window.location.search)
                params.delete('page')
                const next = type === 'all' ? '/moderation' : '/moderation/' + type
                navigate(params.size ? next + '?' + params : next)
              }}
              onOpenPost={id => navigate('/moderation/post/' + id)}
              onOpenUser={id => navigate('/moderation/user/' + id)} />)}
      </main>
      </div>
    </>
  )
}

export default function App() {
  const auth = useAdminSession()
  return auth.status === 'allowed'
    ? <>
        {auth.error && <Card role="alert">{auth.error}</Card>}
        <ConnectedApp onSignOut={auth.signOut} onAccessLost={auth.refresh} signingOut={auth.signingOut} />
      </>
    : <AdminConnection {...auth} />
}
