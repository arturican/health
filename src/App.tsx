import { useEffect, useRef, useState } from 'react'
import { getRoute, Navigation } from './ui/Navigation'
import { TodayPage } from './pages/TodayPage'
import { StorageBoundary } from './ui/StorageBoundary'
import { ProfilePage } from './pages/ProfilePage'
import { WeightPage } from './pages/WeightPage'
import { NutritionPage } from './pages/NutritionPage'
import { DayProvider } from './ui/DayContext'
import { DayPicker } from './ui/DayPicker'
import { SettingsPage } from './pages/SettingsPage'
import { ActivityPage } from './pages/ActivityPage'
import { PhotosPage } from './pages/PhotosPage'
import { DocumentsPage } from './pages/DocumentsPage'
import { useVisibility } from './ui/useVisibility'
import { Icon } from './ui/Icon'

export function App() {
  const [route, setRoute] = useState(() => getRoute(window.location.hash))
  const visibility = useVisibility()
  const mediaRoute = route === 'photos' || route === 'documents'
  const hidden = (route === 'photos' && !visibility?.value.showPhotos) || (route === 'documents' && !visibility?.value.showDocuments)
  const previousHidden = useRef(hidden)
  const previousRoute = useRef(route)
  const main = useRef<HTMLElement>(null)

  useEffect(() => {
    const navigate = () => { setRoute(getRoute(window.location.hash)); }
    window.addEventListener('hashchange', navigate)
    return () => { window.removeEventListener('hashchange', navigate); }
  }, [])

  useEffect(() => {
    if (previousRoute.current !== route || previousHidden.current !== hidden) main.current?.focus()
    previousRoute.current = route
    previousHidden.current = hidden
  }, [route, hidden])

  return (
    <DayProvider>
      <div className="app-shell">
      <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); main.current?.focus() }}>Перейти к содержимому</a>
      <header className="site-header">
        <span className="brand"><span className="brand-mark" aria-hidden="true"><Icon name="heart" /></span> Дневник здоровья</span>
        <span className="edition">Личный дневник · На вашем устройстве</span>
      </header>
      <Navigation active={route} showPhotos={Boolean(visibility?.value.showPhotos)} showDocuments={Boolean(visibility?.value.showDocuments)} />
      <main id="main" tabIndex={-1} ref={main}>
        {(route === 'today' || route === 'nutrition' || route === 'activity') && <DayPicker />}
        <StorageBoundary key={route + String(hidden)}>
        {mediaRoute && !visibility ? <p role="status">Загружаем настройки видимости…</p> : hidden ? <section className="page">
          <h1>Раздел скрыт</h1><p>Его записи и файлы сохранены в этом браузере.</p>
          <a href="#settings">Открыть настройки видимости</a>
        </section> : route === 'today' ? <TodayPage /> : route === 'profile' ? <ProfilePage /> : route === 'weight' ? <WeightPage /> : route === 'nutrition' ? <NutritionPage /> : route === 'activity' ? <ActivityPage /> : route === 'photos' ? <PhotosPage /> : route === 'documents' ? <DocumentsPage /> : <SettingsPage />}
        </StorageBoundary>
      </main>
      <footer className="site-footer">
        <span>Наблюдать. Записывать. Заботиться о себе.</span>
        <span>Дневник не заменяет консультацию специалиста.</span>
      </footer>
      </div>
    </DayProvider>
  )
}
