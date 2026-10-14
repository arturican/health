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

export function isRoute(value: string): value is Route {
  return Object.hasOwn(routes, value)
}

export function getRoute(hash: string): Route {
  const candidate = hash.slice(1)
  return isRoute(candidate) ? candidate : 'today'
}

export function Navigation({ active }: { active: Route }) {
  return (
    <nav className="navigation" aria-label="Разделы дневника">
      {Object.entries(routes).map(([id, label]) => (
        <a key={id} href={`#${id}`} aria-current={active === id ? 'page' : undefined}>{label}</a>
      ))}
    </nav>
  )
}
