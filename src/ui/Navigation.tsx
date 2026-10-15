import { Icon } from './Icon'

export const routes = {
  today: 'Сегодня',
  nutrition: 'Питание',
  activity: 'Активность',
  weight: 'Вес',
  photos: 'Фото',
  documents: 'Документы',
  profile: 'Профиль',
  settings: 'Настройки',
} as const

export type Route = keyof typeof routes

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
          <Icon name={id} />
          {routes[id]}
        </a>
      ))}
    </nav>
  )
}
