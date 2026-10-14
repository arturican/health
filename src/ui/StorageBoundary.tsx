import { Component, type PropsWithChildren } from 'react'

export class StorageBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override render() {
    if (this.state.failed) {
      return (
        <section className="page">
          <h1>Раздел недоступен</h1>
          <p role="alert">Не удалось открыть данные. Обновите страницу и проверьте доступ к хранилищу браузера.</p>
          <a href="#today">Вернуться к дневнику</a>
        </section>
      )
    }
    return this.props.children
  }
}
