import { DocumentForm } from './DocumentForm'
import { DocumentList } from './DocumentList'

export function DocumentsPage() {
  return <section className="page" aria-labelledby="documents-title">
    <h1 id="documents-title">Документы</h1>
    <p>Файлы хранятся в этом браузере. Сохраняйте резервные копии: очистка браузера может удалить записи.</p>
    <DocumentForm />
    <DocumentList />
  </section>
}
