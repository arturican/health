export function Welcome() {
  return (
    <>
        <section className="welcome" aria-labelledby="welcome-title">
          <div className="welcome-copy">
            <p className="eyebrow">В своём ритме</p>
            <h1 id="welcome-title">Дневник<br /> здоровья</h1>
            <p className="intro">Место для ваших записей.<br /> Больше внимания к себе, меньше оценок.</p>
            <a className="primary-link" href="#plan">
              Что будет в дневнике
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 13 13 3M3 3h10v10" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </a>
          </div>
          <aside className="welcome-note" aria-labelledby="note-title">
            <span className="note-number" aria-hidden="true">01</span>
            <p className="eyebrow">Первый шаг</p>
            <h2 id="note-title">Каждая история<br /> начинается с внимания.</h2>
            <p>Мы готовим дневник, в котором можно будет замечать изменения и сохранять важное.</p>
            <p className="stage-note">Сейчас открыт стартовый экран. Ведение записей появится на следующих этапах.</p>
          </aside>
        </section>

        <section id="plan" className="plan" aria-labelledby="plan-title" tabIndex={-1}>
          <div className="section-heading">
            <h2 id="plan-title">Что будет в дневнике</h2>
            <span className="edition">Следующие шаги</span>
          </div>
          <ul className="feature-list">
            <li>
              <span className="feature-number" aria-hidden="true">01 /</span>
              <h3>Профиль и измерения</h3>
              <p>Личная история веса и измерений, чтобы видеть изменения со временем.</p>
            </li>
            <li>
              <span className="feature-number" aria-hidden="true">02 /</span>
              <h3>Питание и активность</h3>
              <p>Записи о приёмах пищи, прогулках и тренировках в одном месте.</p>
            </li>
            <li>
              <span className="feature-number" aria-hidden="true">03 /</span>
              <h3>Фото и документы</h3>
              <p>Сравнение фотографий по датам и личный архив документов.</p>
            </li>
          </ul>
        </section>
    </>
  )
}
