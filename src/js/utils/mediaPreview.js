/**
 * Загрузка файла media_api для просмотра в клиенте.
 * Не открывать /serve/ в iframe: X-Frame-Options: DENY.
 */

import { extractFilenameFromHeaders } from './file-helpers.js'
import { browserMediaUrl, withoutMediaDownloadParam } from './mediaDownload.js'

export const DOCUMENT_PREVIEW_KIND = Object.freeze({
  PDF: 'pdf',
  DOCX: 'docx',
  XLSX: 'xlsx',
  UNSUPPORTED: 'unsupported',
})

/**
 * @param {string} [filename]
 * @param {string} [contentType]
 * @returns {'pdf'|'docx'|'xlsx'|'unsupported'}
 */
export function detectDocumentPreviewKind(filename = '', contentType = '') {
  const name = String(filename || '').toLowerCase()
  const type = String(contentType || '').toLowerCase()
  if (name.endsWith('.pdf') || type.includes('application/pdf')) {
    return DOCUMENT_PREVIEW_KIND.PDF
  }
  if (
    name.endsWith('.docx')
    || type.includes('wordprocessingml')
    || type.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  ) {
    return DOCUMENT_PREVIEW_KIND.DOCX
  }
  // Старый .xls exceljs не читает: он остаётся с кнопкой «Скачать».
  if (name.endsWith('.xlsx') || type.includes('spreadsheetml')) {
    return DOCUMENT_PREVIEW_KIND.XLSX
  }
  return DOCUMENT_PREVIEW_KIND.UNSUPPORTED
}

/**
 * @param {string} url
 * @param {{ filename?: string }} [options]
 * @returns {Promise<{ blob: Blob, filename: string, contentType: string, kind: string }>}
 */
export async function fetchMediaBlob(url, options = {}) {
  if (!url) {
    throw new Error('empty url')
  }
  const safeUrl = withoutMediaDownloadParam(browserMediaUrl(url))
  const response = await fetch(safeUrl, { credentials: 'same-origin', mode: 'cors' })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const blob = await response.blob()
  const filename = options.filename || extractFilenameFromHeaders(
    { 'content-disposition': response.headers.get('content-disposition') },
    'document',
  )
  const contentType = response.headers.get('content-type') || blob.type || ''
  return {
    blob,
    filename,
    contentType,
    kind: detectDocumentPreviewKind(filename, contentType),
  }
}

/**
 * @param {string} [filename]
 * @returns {boolean}
 */
export function canPreviewDocument(filename = '') {
  return detectDocumentPreviewKind(filename) !== DOCUMENT_PREVIEW_KIND.UNSUPPORTED
}
