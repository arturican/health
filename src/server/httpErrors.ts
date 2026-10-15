export class DataError extends Error {
  readonly statusCode: 400 | 404 | 409
  constructor(statusCode: 400 | 404 | 409) {
    super(statusCode === 400 ? 'Проверьте введённые данные' : statusCode === 404 ? 'Запись не найдена' : 'Данные изменились. Обновите запись и повторите действие')
    this.statusCode = statusCode
  }
}

export function inputValue<T>(read: () => T): T {
  try { return read() } catch { throw new DataError(400) }
}
