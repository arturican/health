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

export function App() {
  const [route, setRoute] = useState(() => getRoute(window.location.hash))
  const previousRoute = useRef(route)
  const main = useRef<HTMLElement>(null)

  useEffect(() => {
    const navigate = () => { setRoute(getRoute(window.location.hash)); }
    window.addEventListener('hashchange', navigate)
    return () => { window.removeEventListener('hashchange', navigate); }
  }, [])

  useEffect(() => {
    if (previousRoute.current !== route) main.current?.focus()
    previousRoute.current = route
  }, [route])

  return (
    <DayProvider>
      <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); main.current?.focus() }}>Перейти к содержимому</a>
      <header className="site-header">
        <span className="brand"><span className="brand-mark" aria-hidden="true">д.</span> Дневник здоровья</span>
        <span className="edition">Личный дневник</span>
      </header>
      <Navigation active={route} />
      <main id="main" tabIndex={-1} ref={main}>
        {(route === 'today' || route === 'nutrition' || route === 'activity') && <DayPicker />}
        <StorageBoundary key={route}>
        {route === 'today' ? <TodayPage /> : route === 'profile' ? <ProfilePage /> : route === 'weight' ? <WeightPage /> : route === 'nutrition' ? <NutritionPage /> : route === 'activity' ? <ActivityPage /> : route === 'photos' ? <PhotosPage /> : route === 'documents' ? <DocumentsPage /> : <SettingsPage />}
        </StorageBoundary>
      </main>
      <footer className="site-footer">
        <span>Наблюдать. Записывать. Заботиться о себе.</span>
        <span>Дневник не заменяет консультацию специалиста.</span>
      </footer>
    </DayProvider>
  )
}
