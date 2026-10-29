const HITS = 'document-viewer-hits'
const CURRENT = 'document-viewer-hit-current'

function highlightsAvailable() {
  return typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined'
}

function paintHighlight(name, ranges) {
  if (!highlightsAvailable()) {
    return
  }
  if (!ranges.length) {
    CSS.highlights.delete(name)
    return
  }
  const highlight = new Highlight()
  for (const range of ranges) {
    highlight.add(range)
  }
  CSS.highlights.set(name, highlight)
}

export function clearDocumentSearch() {
  paintHighlight(HITS, [])
  paintHighlight(CURRENT, [])
}

function textChunks(root) {
  const blocks = [...root.querySelectorAll('.document-viewer__sheet, section.docx')]
  const sources = blocks.length ? blocks : [root]
  return sources.map((block) => {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    const nodes = []
    let node = walker.nextNode()
    while (node) {
      if (node.textContent) {
        nodes.push(node)
      }
      node = walker.nextNode()
    }
    return nodes
  }).filter((nodes) => nodes.length)
}

function prepareNeedle(query) {
  const raw = String(query || '').trim()
  if (!raw) {
    return null
  }
  const folded = raw.toLocaleLowerCase()
  if (folded.length !== raw.length) {
    return { needle: raw, fold: false }
  }
  return { needle: folded, fold: true }
}

function rangeFor(map, start, end) {
  const range = document.createRange()
  let open = false
  for (const item of map) {
    const itemEnd = item.start + item.length
    if (itemEnd <= start || item.start >= end) {
      continue
    }
    const localStart = Math.max(0, start - item.start)
    const localEnd = Math.min(item.length, end - item.start)
    if (!open) {
      range.setStart(item.node, localStart)
      open = true
    }
    range.setEnd(item.node, localEnd)
  }
  return open ? range : null
}

function rangesInChunk(nodes, needle, fold) {
  const map = []
  let haystack = ''
  let cursor = 0
  for (const node of nodes) {
    const text = node.textContent || ''
    if (!text) {
      continue
    }
    const piece = fold ? text.toLocaleLowerCase() : text
    if (piece.length !== text.length) {
      continue
    }
    map.push({ start: cursor, node, length: text.length })
    haystack += piece
    cursor += piece.length
  }
  const ranges = []
  if (!needle || haystack.length < needle.length) {
    return ranges
  }
  let from = 0
  while (from <= haystack.length - needle.length) {
    const at = haystack.indexOf(needle, from)
    if (at < 0) {
      break
    }
    const range = rangeFor(map, at, at + needle.length)
    if (range) {
      ranges.push(range)
    }
    from = at + 1
  }
  return ranges
}

export function collectSearchRanges(root, query) {
  const prepared = prepareNeedle(query)
  if (!prepared || !root) {
    return []
  }
  const ranges = []
  for (const nodes of textChunks(root)) {
    ranges.push(...rangesInChunk(nodes, prepared.needle, prepared.fold))
  }
  return ranges
}

function isLetter(ch) {
  return /\p{L}|\p{N}/u.test(ch)
}

function foldChar(ch) {
  const lower = ch.toLocaleLowerCase('ru')
  return lower === 'ё' ? 'е' : lower
}

function foldPlain(value) {
  const folded = []
  let pendingSpace = false
  let skippedHyphen = false
  const text = String(value || '').replace(/\u00ad/g, '')
  for (const ch of text) {
    if (ch === '-' && folded.length && isLetter(folded[folded.length - 1])) {
      skippedHyphen = true
      continue
    }
    if (/\s/.test(ch)) {
      skippedHyphen = false
      pendingSpace = folded.length > 0
      continue
    }
    if (skippedHyphen && !isLetter(ch)) folded.push('-')
    skippedHyphen = false
    if (pendingSpace) {
      folded.push(' ')
      pendingSpace = false
    }
    folded.push(foldChar(ch))
  }
  return folded.join('').trim()
}

function foldNodes(nodes) {
  const folded = []
  const map = []
  let pendingSpace = false
  let hyphenAt = null
  const push = (ch, node, offset) => {
    folded.push(ch)
    map.push(node ? { node, offset } : null)
  }
  for (const node of nodes) {
    const text = node.textContent || ''
    for (let index = 0; index < text.length; index += 1) {
      const ch = text[index]
      if (ch === '\u00ad') continue
      if (ch === '-' && folded.length && isLetter(folded[folded.length - 1])) {
        hyphenAt = { node, offset: index }
        continue
      }
      if (/\s/.test(ch)) {
        hyphenAt = null
        pendingSpace = folded.length > 0
        continue
      }
      if (hyphenAt && !isLetter(ch)) push('-', hyphenAt.node, hyphenAt.offset)
      hyphenAt = null
      if (pendingSpace) {
        push(' ', null, 0)
        pendingSpace = false
      }
      push(foldChar(ch), node, index)
    }
  }
  return { folded: folded.join(''), map }
}

function rangeFromMap(map, start, end) {
  let first = null
  let last = null
  for (let index = start; index < end; index += 1) {
    if (!map[index]) continue
    if (!first) first = map[index]
    last = map[index]
  }
  if (!first || !last) return null
  const range = document.createRange()
  range.setStart(first.node, first.offset)
  range.setEnd(last.node, last.offset + 1)
  return range
}

function looseNeedles(query) {
  const full = foldPlain(query)
  const words = full.split(' ').filter((word) => word.length > 2 && word !== 'nan')
  const variants = []
  if (full.length >= 8) variants.push(full)
  if (words.length > 6) variants.push(words.slice(0, 6).join(' '))
  if (words.length > 4) variants.push(words.slice(0, 4).join(' '))
  return variants.filter((item) => item.length >= 8)
}

function collectLooseRanges(root, query) {
  const needles = looseNeedles(query)
  if (!needles.length || !root) return []
  for (const needle of needles) {
    const ranges = []
    for (const nodes of textChunks(root)) {
      const { folded, map } = foldNodes(nodes)
      let from = 0
      while (from <= folded.length - needle.length) {
        const at = folded.indexOf(needle, from)
        if (at < 0) break
        const range = rangeFromMap(map, at, at + needle.length)
        if (range) ranges.push(range)
        from = at + needle.length
      }
    }
    if (ranges.length) return ranges
  }
  return []
}

export function applyDocumentSearch(root, query, index = 0, options = {}) {
  const prepared = prepareNeedle(query)
  if (!prepared || !root) {
    clearDocumentSearch()
    return { ranges: [], total: 0, index: 0 }
  }
  const ranges = options.loose ? collectLooseRanges(root, query) : collectSearchRanges(root, query)
  const total = ranges.length
  const current = total ? ((Number(index) % total) + total) % total : 0
  const rest = total ? ranges.filter((_, item) => item !== current) : []
  const active = total ? [ranges[current]] : []
  paintHighlight(HITS, rest)
  paintHighlight(CURRENT, active)
  return { ranges, total, index: current }
}

export function scrollSearchRange(range) {
  const node = range?.startContainer
  if (!node?.isConnected) {
    return
  }
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node
  el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
