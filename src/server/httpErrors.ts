export class DataError extends Error {
  readonly statusCode: 400 | 404 | 409
  constructor(statusCode: 400 | 404 | 409) {
    super(statusCode === 400 ? 'Проверьте введённые данные' : statusCode === 404 ? 'Запись не найдена' : 'Данные изменились. Обновите запись и повторите действие')
    this.statusCode = statusCode
  }
}

export class CommandCapacityError extends DataError {
  constructor() {
    super(409)
    this.message = 'Достигнут предел журнала действий. Сохранение временно недоступно. Данные и создание копии доступны. Обратитесь к администратору.'
  }
}

export class CommandRotationError extends DataError {
  constructor() {
    super(409)
    this.message = 'Журнал действий обновлён. Команда не сохранена. Перечитайте дневник и повторите ввод; сохранённые записи не изменены.'
  }
}

function assertDatabaseText(value: unknown): void {
  // PostgreSQL text/JSONB cannot store U+0000. Check decoded input before writes.
  if (typeof value === 'string') {
    if (value.includes('\u0000')) throw new DataError(400)
  } else if (Array.isArray(value)) {
    for (const item of value) assertDatabaseText(item)
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) assertDatabaseText(item)
  }
}

export function inputValue<T>(read: () => T): T {
  try {
    const value = read()
    assertDatabaseText(value)
    return value
  } catch { throw new DataError(400) }
}
