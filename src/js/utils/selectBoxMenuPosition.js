/**
 * Раскладка телепорт-меню SelectBox в viewport.
 * Пока меню ещё за -9999px, getBoundingClientRect может дать height=0
 * (Яндекс.Браузер и др.) — тогда берём оценку, как у DropDown.
 */

export const SELECT_BOX_VIEWPORT_PADDING = 8
export const SELECT_BOX_MIN_MENU_WIDTH = 120
export const SELECT_BOX_ESTIMATED_MENU_HEIGHT = 240

/**
 * @param {number} baseZ
 * @param {number} topModalZ
 * @returns {number}
 */
export function resolveSelectBoxMenuZIndex(baseZ, topModalZ) {
    const modalZ = Number(topModalZ)
    const aboveModal = Number.isFinite(modalZ) ? modalZ + 5 : 0
    return Math.max(baseZ, aboveModal)
}

/**
 * @param {object} args
 * @param {'bottom'|'right'} args.placement
 * @param {'start'|'center'} args.placementAlign
 * @param {number} args.placementGap
 * @param {number} args.dropdownMinWidth
 * @param {DOMRect} args.triggerRect
 * @param {DOMRect|null} args.anchorRect
 * @param {number} args.measuredHeight
 * @param {number} args.vw
 * @param {number} args.vh
 * @param {number} args.offsetTop
 * @param {number} args.offsetLeft
 * @returns {{ top: number, left: number, width: number, openUp: boolean, maxHeight: number }}
 */
export function computeSelectBoxMenuLayout({
    placement,
    placementAlign,
    placementGap,
    dropdownMinWidth,
    triggerRect,
    anchorRect,
    measuredHeight,
    vw,
    vh,
    offsetTop = 0,
    offsetLeft = 0,
}) {
    const pad = SELECT_BOX_VIEWPORT_PADDING
    const minW = SELECT_BOX_MIN_MENU_WIDTH
    const estimated = SELECT_BOX_ESTIMATED_MENU_HEIGHT
    const menuHeight = measuredHeight > 1 ? measuredHeight : 0
    const maxBox = Math.max(0, vh - pad * 2)
    const viewTop = offsetTop
    const viewLeft = offsetLeft
    const viewRight = offsetLeft + vw
    const viewBottom = offsetTop + vh

    if (placement === 'right') {
        const sideGap = placementGap
        const maxWidth = Math.max(0, vw - pad * 2)
        const width = Math.min(Math.max(minW, dropdownMinWidth || 0), maxWidth)
        const fitsRight = triggerRect.right + sideGap + width <= viewRight - pad
        const left = fitsRight
            ? triggerRect.right + sideGap
            : Math.max(viewLeft + pad, triggerRect.left - sideGap - width)
        const heightForAlign = menuHeight || estimated
        let top
        if (placementAlign === 'center') {
            const centerTop = triggerRect.top + triggerRect.height / 2 - heightForAlign / 2
            top = Math.min(
                Math.max(viewTop + pad, centerTop),
                Math.max(viewTop + pad, viewBottom - pad - heightForAlign),
            )
        } else {
            top = Math.min(triggerRect.top, viewBottom - pad)
            top = Math.min(top, viewBottom - pad - Math.min(heightForAlign, maxBox))
            top = Math.max(viewTop + pad, top)
        }
        const maxHeight = Math.max(0, viewBottom - pad - top)
        return { top, left, width, openUp: false, maxHeight }
    }

    const rect = (anchorRect && anchorRect.width > 0) ? anchorRect : triggerRect
    const maxWidth = Math.max(0, vw - pad * 2)
    const triggerWidth = Math.max(0, rect.width)
    const width = Math.min(Math.max(minW, dropdownMinWidth || 0, triggerWidth), maxWidth)
    let left = Math.abs(width - triggerWidth) < 0.5
        ? rect.left
        : Math.min(rect.left, viewRight - pad - width)
    left = Math.max(viewLeft + pad, Math.min(left, viewRight - pad - width))

    const spaceBelow = viewBottom - pad - triggerRect.bottom
    const spaceAbove = triggerRect.top - viewTop - pad
    const openUp = menuHeight
        ? menuHeight > spaceBelow && spaceAbove > spaceBelow
        : spaceBelow < estimated && spaceAbove > spaceBelow
    const available = Math.max(0, openUp ? spaceAbove : spaceBelow)
    const usedHeight = menuHeight ? Math.min(menuHeight, available) : available
    let top
    if (openUp) {
        top = triggerRect.top - usedHeight
    } else {
        top = triggerRect.bottom
    }
    top = Math.min(top, viewBottom - pad - Math.min(menuHeight || available, available))
    top = Math.max(viewTop + pad, top)
    const maxHeight = Math.max(0, Math.min(available, viewBottom - pad - top))
    return { top, left, width, openUp, maxHeight }
}
