// Чтение книги xlsx для DocumentViewer: видимые листы, текст ячеек и объединения.
// Большой лист обрезается, чтобы таблица не заморозила вкладку браузера.

export const SHEET_MAX_ROWS = 2000
export const SHEET_MAX_COLS = 100

const HIDDEN_STATES = new Set(['hidden', 'veryHidden'])

function pad(value) {
  return String(value).padStart(2, '0')
}

// Excel хранит дату без часового пояса: exceljs отдаёт её полночью UTC.
function sheetDate(value) {
  return `${pad(value.getUTCDate())}.${pad(value.getUTCMonth() + 1)}.${value.getUTCFullYear()}`
}

function plainValue(value) {
  if (value == null) {
    return ''
  }
  if (value instanceof Date) {
    return sheetDate(value)
  }
  if (typeof value === 'object') {
    if ('result' in value) {
      return plainValue(value.result)
    }
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part?.text || '').join('')
    }
    if ('text' in value) {
      return plainValue(value.text)
    }
    if (value.error) {
      return String(value.error)
    }
    return ''
  }
  return String(value)
}

function decodeAddress(address) {
  const match = /^([A-Z]+)(\d+)$/.exec(String(address || '').toUpperCase())
  if (!match) {
    return null
  }
  let col = 0
  for (const letter of match[1]) {
    col = col * 26 + (letter.charCodeAt(0) - 64)
  }
  return { row: Number(match[2]), col }
}

function mergeMap(sheet) {
  const spans = new Map()
  const covered = new Set()
  for (const range of sheet.model?.merges || []) {
    const [from, to] = String(range).split(':').map(decodeAddress)
    if (!from || !to) {
      continue
    }
    spans.set(`${from.row}:${from.col}`, {
      rowspan: to.row - from.row + 1,
      colspan: to.col - from.col + 1,
    })
    for (let row = from.row; row <= to.row; row += 1) {
      for (let col = from.col; col <= to.col; col += 1) {
        if (row !== from.row || col !== from.col) {
          covered.add(`${row}:${col}`)
        }
      }
    }
  }
  return { spans, covered }
}

/** Буквенное имя столбца Excel: 1 → A, 27 → AA. */
export function columnName(index) {
  let name = ''
  let rest = index
  while (rest > 0) {
    const mod = (rest - 1) % 26
    name = String.fromCharCode(65 + mod) + name
    rest = Math.floor((rest - 1) / 26)
  }
  return name
}

function readSheet(sheet) {
  const totalRows = sheet.rowCount || 0
  const totalCols = sheet.columnCount || 0
  const rowCount = Math.min(totalRows, SHEET_MAX_ROWS)
  const colCount = Math.min(totalCols, SHEET_MAX_COLS)
  const { spans, covered } = mergeMap(sheet)
  const rows = []
  for (let number = 1; number <= rowCount; number += 1) {
    const row = sheet.getRow(number)
    const cells = []
    for (let col = 1; col <= colCount; col += 1) {
      const key = `${number}:${col}`
      if (covered.has(key)) {
        continue
      }
      const span = spans.get(key)
      cells.push({
        key,
        text: plainValue(row.getCell(col).value),
        rowspan: span ? Math.min(span.rowspan, rowCount - number + 1) : 1,
        colspan: span ? Math.min(span.colspan, colCount - col + 1) : 1,
      })
    }
    rows.push({ number, cells })
  }
  return {
    name: sheet.name,
    columns: colCount,
    rows,
    truncated: totalRows > rowCount || totalCols > colCount,
  }
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {Promise<Array<{ name: string, columns: number, rows: Array, truncated: boolean }>>}
 */
export async function readWorkbookSheets(buffer) {
  const ExcelJSModule = await import('exceljs')
  const ExcelJS = ExcelJSModule.default || ExcelJSModule
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook.worksheets
    .filter((sheet) => !HIDDEN_STATES.has(sheet.state))
    .map(readSheet)
}
