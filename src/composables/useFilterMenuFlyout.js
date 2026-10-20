import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'

import { buildAimTriangle, movementAimsAtRect } from '@/js/utils/menuAimTriangle.js'
import { OVERLAY_MENU_FLYOUT_Z_INDEX, OVERLAY_MENU_Z_INDEX, } from '@/js/utils/overlayZIndex.js'

const VIEWPORT_PADDING = 8
const FLYOUT_MAX_WIDTH = 640
const FLYOUT_ITEM_GAP = 8
const FLYOUT_SCROLLBAR_SLACK = 16
const DATE_PICKER_OVERLAY_SELECTOR = [
  '.dp__menu',
  '.dp--menu',
  '.dp__overlay',
  '.dp--overlay',
  '.dp__outer_menu_wrap',
].join(', ')

let measureCanvas = null

function measureUnwrappedText(el, text) {
  if (!(el instanceof Element) || !text) return 0
  const style = getComputedStyle(el)
  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas')
  }
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) return 0
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  return ctx.measureText(text).width
}

function measureFlyoutItemWidth(item) {
  if (!(item instanceof HTMLElement)) return 0
  const styles = getComputedStyle(item)
  const pad = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0)
  const label = item.querySelector('.filter-menu__option-label')
  const textSource = label instanceof HTMLElement ? label : item
  const text = (textSource.textContent || '').replace(/\s+/g, ' ').trim()
  const textWidth = measureUnwrappedText(textSource, text)
  let extras = 0
  let extraCount = 0
  for (const child of item.children) {
    if (child === label) continue
    extras += child.getBoundingClientRect().width
    extraCount += 1
  }
  const gap = extraCount > 0 ? extraCount * FLYOUT_ITEM_GAP : 0
  return textWidth + pad + extras + gap
}

function measureFlyoutContentWidth(flyout, minWidth) {
  if (!(flyout instanceof HTMLElement)) return minWidth
  let widest = minWidth
  for (const item of flyout.querySelectorAll('.dropdown-item')) {
    widest = Math.max(widest, measureFlyoutItemWidth(item))
  }
  return Math.ceil(widest + FLYOUT_SCROLLBAR_SLACK)
}

/**
 * Позиционирование главной панели и бокового flyout для FilterMenu.
 */
export function useFilterMenuFlyout(options = {}) {
  const hoverCloseDelay = options.hoverCloseDelay ?? 120
  const aimStallDelay = options.aimStallDelay ?? 250
  const aimHistoryMs = options.aimHistoryMs ?? 200
  const aimYTolerance = options.aimYTolerance ?? 72
  const aimAnchorDistance = options.aimAnchorDistance ?? 12
  const flyoutMinWidth = options.flyoutMinWidth ?? 200
  const flyoutGap = options.flyoutGap ?? 2

  const rootEl = ref(null)
  const mainPanelEl = ref(null)
  const flyoutPanelEl = ref(null)

  const isMainOpen = ref(false)
  const activeFlyoutKey = ref(null)
  const pinnedFlyoutKey = ref(null)

  const mainPanelStyle = ref({ top: '0px', left: '0px', width: '0px', zIndex: OVERLAY_MENU_Z_INDEX })
  const flyoutPanelStyle = ref({ top: '0px', left: '0px', width: '0px', zIndex: OVERLAY_MENU_FLYOUT_Z_INDEX })

  let hoverCloseTimer = null
  let suppressOutsideClick = false
  let aimTriangle = null
  let hoveredRow = null
  let aimStallTimer = null
  let pointerHistory = []

  function clearHoverCloseTimer() {
    if (hoverCloseTimer !== null) {
      clearTimeout(hoverCloseTimer)
      hoverCloseTimer = null
    }
  }

  function clearAimStallTimer() {
    if (aimStallTimer !== null) {
      clearTimeout(aimStallTimer)
      aimStallTimer = null
    }
  }

  function clearAimTracking() {
    aimTriangle = null
    clearAimStallTimer()
  }

  function resetAimState() {
    clearAimTracking()
    hoveredRow = null
    pointerHistory = []
  }

  function trackPointer(point) {
    if (!point) return
    const now = performance.now()
    pointerHistory.push({ x: point.x, y: point.y, t: now })
    const cutoff = now - aimHistoryMs
    while (pointerHistory.length > 1 && pointerHistory[0].t < cutoff) {
      pointerHistory.shift()
    }
    if (pointerHistory.length > 12) {
      pointerHistory.splice(0, pointerHistory.length - 12)
    }
  }

  function anchorForPoint(point, rect) {
    const minDistance = aimAnchorDistance * aimAnchorDistance
    const centerX = (rect.left + rect.right) / 2
    const opensRight = point.x <= centerX
    let best = null
    for (const sample of pointerHistory) {
      const dx = point.x - sample.x
      const dy = point.y - sample.y
      if (dx * dx + dy * dy < minDistance) continue
      const onMenuSide = opensRight ? sample.x <= point.x + 1 : sample.x >= point.x - 1
      if (!onMenuSide) continue
      if (!best || (opensRight ? sample.x < best.x : sample.x > best.x)) best = sample
    }
    return best
  }

  function pointerPoint(event) {
    if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
      return { x: event.clientX, y: event.clientY }
    }
    const last = pointerHistory[pointerHistory.length - 1]
    return last ? { x: last.x, y: last.y } : null
  }

  function flyoutAimRect() {
    const flyout = flyoutPanelEl.value
    if (!(flyout instanceof HTMLElement)) return null
    const rect = flyout.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return rect
  }

  function aimsAtOpenFlyout(point) {
    if (!point || !activeFlyoutKey.value || pinnedFlyoutKey.value) return false
    const rect = flyoutAimRect()
    if (!rect) return false
    const anchor = anchorForPoint(point, rect)
    if (!anchor) return false
    return movementAimsAtRect(anchor, point, rect, aimYTolerance)
  }

  function holdFlyoutForAim(point) {
    if (!aimsAtOpenFlyout(point)) return false
    const rect = flyoutAimRect()
    const anchor = rect ? anchorForPoint(point, rect) : null
    if (!rect || !anchor) return false
    aimTriangle = buildAimTriangle(anchor, rect, aimYTolerance)
    clearHoverCloseTimer()
    armAimStallTimer()
    return true
  }

  function armAimStallTimer() {
    clearAimStallTimer()
    aimStallTimer = setTimeout(() => {
      aimStallTimer = null
      if (!aimTriangle) return
      resolveAimTarget()
    }, aimStallDelay)
  }

  function isPointInsideFlyout(point) {
    const flyout = flyoutPanelEl.value
    if (!(flyout instanceof HTMLElement)) return false
    const rect = flyout.getBoundingClientRect()
    return point.x >= rect.left
      && point.x <= rect.right
      && point.y >= rect.top
      && point.y <= rect.bottom
  }

  function rowFromTarget(target) {
    const main = mainPanelEl.value
    if (!(main instanceof HTMLElement) || !(target instanceof Element)) return null
    const row = target.closest('.filter-menu__row')
    if (!(row instanceof HTMLElement) || !main.contains(row)) return null
    const key = row.dataset.fieldKey
    if (!key) return null
    return { key, el: row }
  }

  function resolveAimTarget() {
    const row = hoveredRow
    clearAimTracking()
    if (pinnedFlyoutKey.value) return
    if (
      row?.el instanceof HTMLElement
      && row.el.isConnected
      && row.key !== activeFlyoutKey.value
    ) {
      openFlyout(row.key, row.el)
      return
    }
    if (!row?.el?.isConnected) {
      scheduleFlyoutClose()
    }
  }

  function scheduleFlyoutClose() {
    clearHoverCloseTimer()
    hoverCloseTimer = setTimeout(() => {
      hoverCloseTimer = null
      // Пока курсор внутри треугольника, закрытие откладывается: выход из него закроет само.
      if (pinnedFlyoutKey.value || aimTriangle) return
      const hovered = document.querySelector(`${DATE_PICKER_OVERLAY_SELECTOR}:hover`)
      if (hovered) return
      activeFlyoutKey.value = null
    }, hoverCloseDelay)
  }

  function isDatePickerOverlay(target) {
    const el = target instanceof Element ? target : target?.parentElement
    if (!(el instanceof Element)) return false
    return Boolean(el.closest(DATE_PICKER_OVERLAY_SELECTOR))
  }

  function flyoutContains(target) {
    if (isDatePickerOverlay(target)) return true
    if (!(target instanceof Node)) return false
    const main = mainPanelEl.value
    const flyout = flyoutPanelEl.value
    const root = rootEl.value
    return Boolean(
      (root && root.contains(target))
      || (main && main.contains(target))
      || (flyout && flyout.contains(target)),
    )
  }

  function updateMainPanelPosition() {
    const root = rootEl.value
    if (!root) return
    const trigger = root.querySelector('.filter-menu__trigger')
    if (!trigger) return

    const triggerRect = trigger.getBoundingClientRect()
    const minWidth = Math.max(280, triggerRect.width)
    const maxWidth = Math.max(0, window.innerWidth - VIEWPORT_PADDING * 2)
    const width = Math.min(minWidth, maxWidth)
    let left = Math.min(triggerRect.left, window.innerWidth - VIEWPORT_PADDING - width)
    left = Math.max(VIEWPORT_PADDING, left)

    let top = triggerRect.bottom + 4
    const panelHeight = mainPanelEl.value?.getBoundingClientRect().height || 0
    if (panelHeight && top + panelHeight > window.innerHeight - VIEWPORT_PADDING) {
      const aboveTop = triggerRect.top - panelHeight - 4
      if (aboveTop >= VIEWPORT_PADDING) {
        top = aboveTop
      }
    }

    const rootStyle = root ? getComputedStyle(root) : null
    const menuFontSize = rootStyle?.getPropertyValue('--select-box-font-size').trim() || '1rem'
    const itemPaddingY = rootStyle?.getPropertyValue('--select-box-item-padding-y').trim() || '0.375rem'
    const itemPaddingX = rootStyle?.getPropertyValue('--select-box-item-padding-x').trim() || '0.75rem'

    mainPanelStyle.value = {
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      maxWidth: `${maxWidth}px`,
      zIndex: OVERLAY_MENU_Z_INDEX,
      fontSize: menuFontSize,
      lineHeight: '1.5',
      '--select-box-font-size': menuFontSize,
      '--select-box-item-padding-y': itemPaddingY,
      '--select-box-item-padding-x': itemPaddingX,
    }
  }

  function updateFlyoutPosition(rowEl) {
    if (!(rowEl instanceof HTMLElement)) return

    const root = rootEl.value
    const rootStyle = root ? getComputedStyle(root) : null
    const menuFontSize = rootStyle?.getPropertyValue('--select-box-font-size').trim() || '1rem'
    const itemPaddingY = rootStyle?.getPropertyValue('--select-box-item-padding-y').trim() || '0.375rem'
    const itemPaddingX = rootStyle?.getPropertyValue('--select-box-item-padding-x').trim() || '0.75rem'

    const rowRect = rowEl.getBoundingClientRect()
    const maxWidth = Math.max(0, Math.min(FLYOUT_MAX_WIDTH, window.innerWidth - VIEWPORT_PADDING * 2))
    const contentWidth = measureFlyoutContentWidth(flyoutPanelEl.value, flyoutMinWidth)
    const width = Math.min(Math.max(flyoutMinWidth, contentWidth), maxWidth)

    let left = rowRect.right + flyoutGap
    const fitsRight = left + width <= window.innerWidth - VIEWPORT_PADDING
    if (!fitsRight) {
      left = Math.max(VIEWPORT_PADDING, rowRect.left - flyoutGap - width)
    }
    left = Math.min(left, window.innerWidth - VIEWPORT_PADDING - width)
    left = Math.max(VIEWPORT_PADDING, left)

    let top = rowRect.top
    const panelHeight = flyoutPanelEl.value?.getBoundingClientRect().height || 0
    if (panelHeight) {
      top = Math.min(
        Math.max(VIEWPORT_PADDING, top),
        Math.max(VIEWPORT_PADDING, window.innerHeight - VIEWPORT_PADDING - panelHeight),
      )
    }

    flyoutPanelStyle.value = {
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      maxWidth: `${maxWidth}px`,
      zIndex: OVERLAY_MENU_FLYOUT_Z_INDEX,
      fontSize: menuFontSize,
      lineHeight: '1.5',
      '--select-box-font-size': menuFontSize,
      '--select-box-item-padding-y': itemPaddingY,
      '--select-box-item-padding-x': itemPaddingX,
    }
  }

  function openMain() {
    if (isMainOpen.value) return
    isMainOpen.value = true
    activeFlyoutKey.value = null
    pinnedFlyoutKey.value = null
    nextTick(() => {
      updateMainPanelPosition()
      requestAnimationFrame(() => updateMainPanelPosition())
    })
  }

  function closeMain() {
    clearHoverCloseTimer()
    resetAimState()
    isMainOpen.value = false
    activeFlyoutKey.value = null
    pinnedFlyoutKey.value = null
  }

  function toggleMain() {
    if (isMainOpen.value) closeMain()
    else {
      suppressOutsideClick = true
      openMain()
      nextTick(() => {
        suppressOutsideClick = false
      })
    }
  }

  function openFlyout(fieldKey, rowEl, { pin = false } = {}) {
    if (!fieldKey) return
    const switching = activeFlyoutKey.value && String(activeFlyoutKey.value) !== String(fieldKey)
    clearHoverCloseTimer()
    clearAimTracking()
    if (switching) pointerHistory = []
    activeFlyoutKey.value = fieldKey
    if (pin) {
      pinnedFlyoutKey.value = pinnedFlyoutKey.value === fieldKey ? null : fieldKey
      if (!pinnedFlyoutKey.value) {
        activeFlyoutKey.value = null
        return
      }
      activeFlyoutKey.value = pinnedFlyoutKey.value
    }
    nextTick(() => {
      updateFlyoutPosition(rowEl)
      requestAnimationFrame(() => updateFlyoutPosition(rowEl))
    })
  }

  function closeFlyout() {
    clearHoverCloseTimer()
    resetAimState()
    activeFlyoutKey.value = null
    pinnedFlyoutKey.value = null
  }

  function pinActiveFlyout() {
    if (activeFlyoutKey.value) {
      pinnedFlyoutKey.value = activeFlyoutKey.value
    }
  }

  function onRowEnter(fieldKey, rowEl, event) {
    hoveredRow = { key: fieldKey, el: rowEl }
    if (pinnedFlyoutKey.value && pinnedFlyoutKey.value !== fieldKey) return
    if (activeFlyoutKey.value && activeFlyoutKey.value !== fieldKey && holdFlyoutForAim(pointerPoint(event))) {
      return
    }
    openFlyout(fieldKey, rowEl)
  }

  function onRowLeave(event) {
    const rowEl = event?.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : event?.target?.closest?.('.filter-menu__row')
    if (rowEl && hoveredRow?.el === rowEl) {
      hoveredRow = null
    }
    const enteredRow = rowFromTarget(event?.relatedTarget)
    if (enteredRow) hoveredRow = enteredRow
    if (pinnedFlyoutKey.value) return
    if (event?.pointerType === 'touch') {
      scheduleFlyoutClose()
      return
    }
    const point = pointerPoint(event)
    const leftActiveRow = Boolean(
      rowEl instanceof HTMLElement
      && activeFlyoutKey.value != null
      && String(rowEl.dataset.fieldKey) === String(activeFlyoutKey.value),
    )
    if (leftActiveRow && holdFlyoutForAim(point)) return
    if (aimTriangle) return
    if (point && (isPointInsideFlyout(point) || isDatePickerOverlay(event?.relatedTarget))) {
      clearHoverCloseTimer()
      return
    }
    scheduleFlyoutClose()
  }

  function onFlyoutEnter() {
    clearHoverCloseTimer()
    clearAimTracking()
  }

  function onDocumentPointerMove(event) {
    if (!isMainOpen.value || event.pointerType === 'touch') return
    const point = { x: event.clientX, y: event.clientY }
    const underRow = rowFromTarget(event.target)
    if (underRow) {
      hoveredRow = underRow
    } else if (!isPointInsideFlyout(point) && !isDatePickerOverlay(event.target)) {
      hoveredRow = null
    }
    if (isPointInsideFlyout(point) || isDatePickerOverlay(event.target)) {
      clearHoverCloseTimer()
      clearAimTracking()
      trackPointer(point)
      return
    }
    if (aimTriangle) {
      if (aimsAtOpenFlyout(point)) {
        armAimStallTimer()
        trackPointer(point)
        return
      }
      resolveAimTarget()
    }
    trackPointer(point)
  }

  function onFlyoutLeave(event) {
    if (pinnedFlyoutKey.value) return
    if (isDatePickerOverlay(event?.relatedTarget)) return
    scheduleFlyoutClose()
  }

  function onDocumentMouseDown(event) {
    if (suppressOutsideClick || !isMainOpen.value) return
    if (flyoutContains(event.target)) return
    closeMain()
  }

  function onDocumentKeydown(event) {
    if (!isMainOpen.value) return
    if (event.key !== 'Escape') return
    if (activeFlyoutKey.value) {
      closeFlyout()
      event.preventDefault()
      return
    }
    closeMain()
    event.preventDefault()
  }

  function onWindowChange() {
    if (!isMainOpen.value) return
    updateMainPanelPosition()
    const activeRow = mainPanelEl.value?.querySelector('.filter-menu__row--active')
    if (activeRow && activeFlyoutKey.value) {
      updateFlyoutPosition(activeRow)
    }
  }

  onMounted(() => {
    document.addEventListener('mousedown', onDocumentMouseDown)
    document.addEventListener('keydown', onDocumentKeydown)
    document.addEventListener('pointermove', onDocumentPointerMove)
    window.addEventListener('resize', onWindowChange)
    window.addEventListener('scroll', onWindowChange, true)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocumentMouseDown)
    document.removeEventListener('keydown', onDocumentKeydown)
    document.removeEventListener('pointermove', onDocumentPointerMove)
    window.removeEventListener('resize', onWindowChange)
    window.removeEventListener('scroll', onWindowChange, true)
    clearHoverCloseTimer()
    resetAimState()
  })

  return {
    rootEl,
    mainPanelEl,
    flyoutPanelEl,
    isMainOpen,
    activeFlyoutKey,
    pinnedFlyoutKey,
    mainPanelStyle,
    flyoutPanelStyle,
    toggleMain,
    closeMain,
    openFlyout,
    closeFlyout,
    pinActiveFlyout,
    onRowEnter,
    onRowLeave,
    onFlyoutEnter,
    onFlyoutLeave,
    updateMainPanelPosition,
    updateFlyoutPosition,
    flyoutContains,
  }
}