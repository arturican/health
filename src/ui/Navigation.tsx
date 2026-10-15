export const routes = {
  today: 'Сегодня',
  profile: 'Профиль',
  weight: 'Вес',
  nutrition: 'Питание',
  activity: 'Активность',
  photos: 'Фото',
  documents: 'Документы',
  settings: 'Настройки',
} as const

export type Route = keyof typeof routes

const routeIcons: Record<Route, string> = {
  today: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  profile: 'M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  weight: 'M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2ZM8 8a5 5 0 0 1 8 0M12 10l2-3',
  nutrition: 'M7 3v7m-3-7v5a3 3 0 0 0 6 0V3M7 11v10M20 21V3c-4 2-5 7-1 9h1',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  photos: 'M3 5h18v15H3ZM7 5l1-2h8l1 2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  documents: 'M14 3H5v18h14V8ZM14 3v5h5M8 12h8M8 16h6',
  settings: 'M4 7h16M4 17h16M9 4v6M15 14v6',
}

export function isRoute(value: string): value is Route {
  return Object.hasOwn(routes, value)
}

export function getRoute(hash: string): Route {
  const candidate = hash.slice(1)
  return isRoute(candidate) ? candidate : 'today'
}

export function Navigation({ active, showPhotos = true, showDocuments = true }: { active: Route; showPhotos?: boolean; showDocuments?: boolean }) {
  return (
    <nav className="navigation" aria-label="Разделы дневника">
      <span className="navigation-label" aria-hidden="true">МОЙ ДНЕВНИК</span>
      {Object.keys(routes).filter(isRoute).filter(id => (id !== 'photos' || showPhotos) && (id !== 'documents' || showDocuments)).map(id => (
        <a key={id} href={`#${id}`} aria-current={active === id ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={routeIcons[id]} /></svg>
          {routes[id]}
        </a>
      ))}
    </nav>
  )
}
