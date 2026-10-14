import { useEffect, useRef, useState } from 'react'
import { getRoute, Navigation, routes } from './ui/Navigation'
import { Welcome } from './ui/Welcome'
import { StorageBoundary } from './ui/StorageBoundary'
import { ProfilePage } from './pages/ProfilePage'
import { WeightPage } from './pages/WeightPage'
import { NutritionPage } from './pages/NutritionPage'

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
    <>
      <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); main.current?.focus() }}>Перейти к содержимому</a>
      <header className="site-header">
        <span className="brand"><span className="brand-mark" aria-hidden="true">д.</span> Дневник здоровья</span>
        <span className="edition">Личный дневник</span>
      </header>
      <Navigation active={route} />
      <main id="main" tabIndex={-1} ref={main}>
        <StorageBoundary key={route}>
        {route === 'today' ? <Welcome /> : route === 'profile' ? <ProfilePage /> : route === 'weight' ? <WeightPage /> : route === 'nutrition' ? <NutritionPage /> : (
          <section className="page" aria-labelledby="page-title">
            <h1 id="page-title">{routes[route]}</h1>
            <p>Этот раздел готовится. Запись данных появится на следующих этапах.</p>
          </section>
        )}
        </StorageBoundary>
      </main>
      <footer className="site-footer">
        <span>Наблюдать. Записывать. Заботиться о себе.</span>
        <span>Дневник не заменяет консультацию специалиста.</span>
      </footer>
    </>
  )
}
