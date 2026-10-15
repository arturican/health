// Один настоящий PDF-лист с ASCII-текстом и таблицей смещений; без внешних шрифтов.
export function demoPdf(date: string, hemoglobin: number, glucose: number) {
  const lines = ['SYNTHETIC DEMO - NOT A MEDICAL REPORT', 'Fictional user: Ilya Vetrov', `Date: ${date}`,
    `Hemoglobin: ${String(hemoglobin)} g/L`, `Glucose: ${String(glucose)} mmol/L`,
    'Qualitative example: Not detected', 'Reference ranges are intentionally omitted.', 'These values are not medical advice.']
  const content = `BT /F1 16 Tf 45 780 Td ${lines.map((line, index) => `${index ? '0 -32 Td ' : ''}(${line}) Tj`).join('\n')} ET`
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${String(Buffer.byteLength(content))} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  let pdf = '%PDF-1.7\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${String(index + 1)} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`
  return Buffer.from(pdf)
}
