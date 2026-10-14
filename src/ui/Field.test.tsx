import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Field, SelectField } from './Field'

describe('Общее поле формы', () => {
  it('связывает подписи с разными автоматически созданными идентификаторами', () => {
    render(<><Field label="Имя" /><Field label="Заметка" /></>)

    const name = screen.getByRole('textbox', { name: 'Имя' })
    const note = screen.getByRole('textbox', { name: 'Заметка' })
    expect(name.id).not.toBe('')
    expect(note.id).not.toBe(name.id)
    expect(screen.getByLabelText('Имя')).toBe(name)
    expect(screen.getByLabelText('Заметка')).toBe(note)
    expect(name).toHaveAttribute('aria-invalid', 'false')
    expect(name).not.toHaveAttribute('aria-describedby')
  })

  it('сохраняет явный id, свойства input и обработчик реального ввода', () => {
    const onChange = vi.fn()
    render(<Field label="Вес" id="weight" name="weightKg" type="number"
      min="1" max="300" step="0.1" required defaultValue="70" onChange={onChange} />)

    const input = screen.getByRole('spinbutton', { name: 'Вес' })
    expect(input).toHaveAttribute('id', 'weight')
    expect(input).toHaveAttribute('name', 'weightKg')
    expect(input).toHaveAttribute('min', '1')
    expect(input).toHaveAttribute('max', '300')
    expect(input).toHaveAttribute('step', '0.1')
    expect(input).toBeRequired()
    expect(input).toHaveValue(70)

    fireEvent.change(input, { target: { value: '71.5' } })
    expect(input).toHaveValue(71.5)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('сохраняет доступную внешнюю подсказку без ошибки', () => {
    render(<><p id="weight-help">Масса в килограммах</p>
      <Field label="Вес" aria-describedby="weight-help" /></>)

    expect(screen.getByRole('textbox', { name: 'Вес' })).toHaveAccessibleDescription('Масса в килограммах')
  })

  it('объявляет ошибку описанием, сохраняя имя поля и внешнюю подсказку', () => {
    const { rerender } = render(<><p id="weight-help">Масса в килограммах</p>
      <Field label="Вес" id="weight" error="Введите число" aria-describedby="weight-help" /></>)

    const input = screen.getByRole('textbox', { name: /^Вес/ })
    expect(input).toHaveAccessibleName('Вес')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Масса в килограммах Введите число')

    rerender(<><p id="weight-help">Масса в килограммах</p>
      <Field label="Вес" id="weight" aria-describedby="weight-help" /></>)
    expect(input).toHaveAttribute('aria-invalid', 'false')
    expect(input).toHaveAccessibleDescription('Масса в килограммах')
    expect(screen.queryByText('Введите число')).not.toBeInTheDocument()
  })

  it('связывает ошибку с полем и без внешней подсказки', () => {
    render(<Field label="Дата" error="Выберите дату" />)

    const input = screen.getByRole('textbox', { name: /^Дата/ })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Выберите дату')
  })
})

describe('Общий список выбора', () => {
  it('создаёт уникальные идентификаторы и передаёт значение, name и обработчик', () => {
    const onChange = vi.fn()
    render(<><SelectField label="Параметр" name="parameter" defaultValue="none" onChange={onChange}>
      <option value="none">Не указан</option><option value="male">Мужской</option>
    </SelectField><SelectField label="Другой параметр"><option value="none">Не указан</option></SelectField></>)

    const select = screen.getByRole('combobox', { name: 'Параметр' })
    const other = screen.getByRole('combobox', { name: 'Другой параметр' })
    expect(select.id).not.toBe('')
    expect(other.id).not.toBe(select.id)
    expect(select).toHaveAttribute('name', 'parameter')
    expect(select).toHaveAttribute('aria-invalid', 'false')
    expect(select).not.toHaveAttribute('aria-describedby')
    expect(select).toHaveValue('none')
    fireEvent.change(select, { target: { value: 'male' } })
    expect(select).toHaveValue('male')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('сохраняет явный id, доступное имя и внешнее описание вместе с ошибкой', () => {
    const { rerender } = render(<><p id="parameter-help">Необязательный параметр</p>
      <SelectField label="Параметр" id="parameter" error="Выберите значение" aria-describedby="parameter-help">
        <option value="none">Не указан</option>
      </SelectField></>)

    const select = screen.getByRole('combobox', { name: 'Параметр' })
    expect(select).toHaveAttribute('id', 'parameter')
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAccessibleDescription('Необязательный параметр Выберите значение')
    rerender(<><p id="parameter-help">Необязательный параметр</p>
      <SelectField label="Параметр" id="parameter" aria-describedby="parameter-help">
        <option value="none">Не указан</option>
      </SelectField></>)
    expect(select).toHaveAttribute('aria-invalid', 'false')
    expect(select).toHaveAccessibleDescription('Необязательный параметр')
  })
})
