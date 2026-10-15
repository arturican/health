import { expect, it } from 'vitest'
import { assertPhotoWithoutExif } from './photoExif'

const exif = [69, 120, 105, 102, 0, 0]
const segment = (marker: number, payload: number[]) => {
  const length = payload.length + 2
  return [255, marker, length >>> 8, length & 255, ...payload]
}
const jpeg = (...segments: number[][]) => new Uint8Array([255, 216, ...segments.flat(), 255, 217])
const scan = () => segment(218, [1, 1, 0, 0, 63, 0])

it('разрешает JPEG без EXIF, включая другие APP1 и данные с похожей сигнатурой', () => {
  const alternatives = [[], [69, 120, 105, 102, 0], [69, 120, 105, 102, 0, 1], [0, ...exif]]
  expect(() => { assertPhotoWithoutExif(jpeg()); }).not.toThrow()
  for (const payload of alternatives) {
    expect(() => { assertPhotoWithoutExif(jpeg(segment(225, payload))); }).not.toThrow()
  }
  expect(() => { assertPhotoWithoutExif(jpeg(segment(224, exif), segment(254, exif))); }).not.toThrow()
})

it('отклоняет точную сигнатуру EXIF в начале APP1 при минимальной и большей длине', () => {
  for (const payload of [exif, [...exif, 73, 73, 42, 0, 8, 0, 0, 0]]) {
    expect(() => { assertPhotoWithoutExif(jpeg(segment(225, payload))); }).toThrow('Подготовленное фото в копии содержит EXIF')
  }
})

it('находит EXIF после других сегментов, fill bytes и самостоятельных маркеров', () => {
  const bytes = jpeg(
    segment(224, [74, 70, 73, 70, 0]),
    [255, 255, 216, 255, 1, 255, 208, 255, 215],
    segment(225, [88, 77, 80, 0]),
    segment(225, exif),
  )
  expect(() => { assertPhotoWithoutExif(bytes); }).toThrow('Подготовленное фото в копии содержит EXIF')
})

it('не трактует stuffed FF00 и restart-маркеры в пикселях как APP1 с EXIF', () => {
  const bytes = jpeg(scan(), [23, 255, 0, 225, 0, 8, ...exif, 255, 208, 34, 255, 215, 42])
  expect(() => { assertPhotoWithoutExif(bytes); }).not.toThrow()
})

it('отклоняет настоящий APP1 с EXIF после SOS перед EOI', () => {
  const bytes = jpeg(scan(), [23, 255, 208, 34], segment(225, exif))
  expect(() => { assertPhotoWithoutExif(bytes); }).toThrow('Подготовленное фото в копии содержит EXIF')
})

it('проверяет APP1 между progressive scans и после следующего скана', () => {
  const firstScan = [scan(), [23, 255, 0, 225], segment(196, [0])]
  expect(() => { assertPhotoWithoutExif(jpeg(...firstScan, segment(225, exif), scan(), [34])); }).toThrow()
  expect(() => { assertPhotoWithoutExif(jpeg(...firstScan, segment(225, [88, 77, 80]), scan(), [34], segment(225, exif))); }).toThrow()
  expect(() => { assertPhotoWithoutExif(jpeg(...firstScan, segment(225, [88, 77, 80]), scan(), [34])); }).not.toThrow()
})

it('отклоняет любые байты после EOI общей ошибкой, не читая их как EXIF', () => {
  const bytes = jpeg(scan(), [23], [255, 217], segment(225, exif))
  expect(() => { assertPhotoWithoutExif(bytes); }).toThrow('Не удалось проверить метаданные JPEG')
  expect(() => { assertPhotoWithoutExif(jpeg([255, 217], [0])); }).toThrow('Не удалось проверить метаданные JPEG')
})

it('отклоняет отсутствующую длину, некорректные границы и не-маркер общей ошибкой', () => {
  const malformed = [
    [], [255], [255, 255, 255], [0, 0],
    [255, 225], [255, 225, 0], [255, 225, 0, 0], [255, 225, 0, 1],
    [255, 225, 255, 255, ...exif], [255, 225, 0, 8, ...exif.slice(0, 5)],
  ]
  for (const tail of malformed) {
    expect(() => { assertPhotoWithoutExif(new Uint8Array([255, 216, ...tail])); }).toThrow('Не удалось проверить метаданные JPEG')
  }
  expect(() => { assertPhotoWithoutExif(jpeg([0, 0], segment(225, exif))); }).toThrow('Не удалось проверить метаданные JPEG')
  for (const header of [[], [255], [0, 216], [255, 0], [0, 0]]) {
    expect(() => { assertPhotoWithoutExif(new Uint8Array(header)); }).toThrow('Не удалось проверить метаданные JPEG')
  }
})

it('не читает EXIF за пределами APP1 и отклоняет все усечения без завершённого EOI', () => {
  const outside = jpeg([255, 225, 0, 2], exif)
  expect(() => { assertPhotoWithoutExif(outside); }).toThrow('Не удалось проверить метаданные JPEG')
  const complete = jpeg(segment(224, [74, 70, 73, 70, 0]), scan(), [23, 255, 0, 225, 0, 8, ...exif, 255, 208, 34])
  for (let length = 0; length < complete.length; length++) {
    expect(() => { assertPhotoWithoutExif(complete.subarray(0, length)); }).toThrow('Не удалось проверить метаданные JPEG')
  }
  expect(() => { assertPhotoWithoutExif(complete); }).not.toThrow()
})

it('уважает byteOffset и не изменяет байты при успешной проверке и отказе', () => {
  for (const payload of [[0, ...exif], exif]) {
    const input = jpeg(segment(225, payload))
    const container = new Uint8Array(input.length + 7)
    container.fill(37)
    container.set(input, 3)
    const before = container.slice()
    const view = container.subarray(3, 3 + input.length)
    if (payload === exif) expect(() => { assertPhotoWithoutExif(view); }).toThrow()
    else expect(() => { assertPhotoWithoutExif(view); }).not.toThrow()
    expect(container).toEqual(before)
  }
})
