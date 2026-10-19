import { ref, watch, onBeforeUnmount } from 'vue'

const SELECT_BOX_MENU_MAX_HEIGHT = 260

const VIEWPORT_PADDING = 8
const SIDE_MENU_MIN_WIDTH = 120
const ESTIMATED_MENU_HEIGHT = 240

// Меню остаётся в DOM внутри SelectBox (переменные, тема модуля, клик снаружи),
// а рисуется в верхнем слое браузера, поэтому overflow предков его не обрезает.
const supportsTopLayer = typeof HTMLElement !== 'undefined'
    && typeof HTMLElement.prototype.showPopover === 'function'

function measureContentHeight(menu) {
    let height = menu.offsetHeight - menu.clientHeight
    for (const child of menu.children) {
        const scroller = child.classList.contains('dropdown-menu-list')
            ? child
            : child.querySelector('.dropdown-menu-list')
        height += scroller ? scroller.scrollHeight : child.offsetHeight
    }
    return height
}

function isOutsideRect(rect, box) {
    return rect.bottom <= box.top || rect.top >= box.bottom || rect.right <= box.left || rect.left >= box.right
}

function isClippedOut(el) {
    const rect = el.getBoundingClientRect()
    let parent = el.parentElement
    while (parent && parent !== document.body && parent !== document.documentElement) {
        const style = getComputedStyle(parent)
        if ((style.overflowX !== 'visible' || style.overflowY !== 'visible') && isOutsideRect(rect, parent.getBoundingClientRect())) {
            return true
        }
        parent = parent.parentElement
    }
    const html = document.documentElement
    return isOutsideRect(rect, { top: 0, left: 0, bottom: html.clientHeight, right: html.clientWidth })
}

// В момент открытия у триггера ещё доигрывает scale() от :active — берём рамку без transform.
function getLayoutRect(el) {
    const rect = el.getBoundingClientRect()
    const width = el.offsetWidth || rect.width
    const height = el.offsetHeight || rect.height
    const left = rect.left + (rect.width - width) / 2
    const top = rect.top + (rect.height - height) / 2
    return { left, top, width, height, right: left + width, bottom: top + height }
}

function px(value) {
    return `${Math.max(0, Math.round(value))}px`
}

/**
 * Позиция выпадающего списка SelectBox: верхний слой (Popover API) с координатами у триггера,
 * без поддержки — absolute внутри компонента.
 * @param {object} options
 * @param {object} options.props — props SelectBox
 * @param {import('vue').Ref<HTMLElement|null>} options.rootEl
 * @param {import('vue').Ref<HTMLElement|null>} options.menuEl
 * @param {import('vue').Ref<boolean>} options.isOpen
 * @param {() => void} options.onTriggerHidden — триггер ушёл за край прокручиваемого контейнера
 */
export function useSelectBoxMenuPosition({ props, rootEl, menuEl, isOpen, onTriggerHidden }) {
    const menuTopLayer = supportsTopLayer
    const menuOpensUpward = ref(false)
    const menuStyle = ref({
        '--select-box-menu-max-height': `${SELECT_BOX_MENU_MAX_HEIGHT}px`,
    })

    function getTrigger() {
        return rootEl.value?.querySelector('.select-trigger') || null
    }

    function showInTopLayer(menu) {
        if (!menuTopLayer || !menu?.isConnected || menu.matches(':popover-open')) return
        menu.showPopover()
    }

    function getMinWidth(viewportWidth) {
        const anchorWidth = props.dropdownAnchorRef?.value?.getBoundingClientRect?.().width || 0
        return Math.min(Math.max(props.dropdownMinWidth || 0, anchorWidth), viewportWidth - VIEWPORT_PADDING * 2)
    }

    function layoutSide(rect, menu, viewport, wanted, ceiling) {
        const { width: vw, height: vh } = viewport
        const pad = VIEWPORT_PADDING
        const gap = props.placementGap
        const minWidth = Math.max(SIDE_MENU_MIN_WIDTH, getMinWidth(vw))
        const width = Math.min(Math.max(menu?.offsetWidth || 0, minWidth), vw - pad * 2)
        let left = rect.right + gap
        if (left + width > vw - pad) left = Math.max(pad, rect.left - gap - width)
        const maxHeight = Math.min(ceiling, vh - pad * 2)
        const height = Math.min(wanted, maxHeight)
        let top = props.placementAlign === 'center' ? rect.top + rect.height / 2 - height / 2 : rect.top
        top = Math.max(pad, Math.min(top, vh - pad - height))
        menuOpensUpward.value = false
        return {
            '--select-box-menu-top': px(top),
            '--select-box-menu-bottom': 'auto',
            '--select-box-menu-left': px(left),
            '--select-box-menu-width': 'max-content',
            '--select-box-menu-min-width': px(minWidth),
            '--select-box-menu-max-height': px(Math.floor(maxHeight)),
        }
    }

    function layoutBelow(rect, viewport, wanted, ceiling) {
        const { width: vw, height: vh } = viewport
        const pad = VIEWPORT_PADDING
        const spaceBelow = Math.max(0, vh - pad - rect.bottom)
        const spaceAbove = Math.max(0, rect.top - pad)
        const openUp = wanted > spaceBelow && spaceAbove > spaceBelow
        menuOpensUpward.value = openUp
        const available = openUp ? spaceAbove : spaceBelow
        const width = Math.min(rect.width, vw - pad * 2)
        const minWidth = Math.max(width, getMinWidth(vw))
        const left = Math.max(pad, Math.min(rect.left, vw - pad - minWidth))
        return {
            '--select-box-menu-top': openUp ? 'auto' : `${rect.bottom}px`,
            '--select-box-menu-bottom': openUp ? `${vh - rect.top}px` : 'auto',
            '--select-box-menu-left': `${left}px`,
            '--select-box-menu-width': `${width}px`,
            '--select-box-menu-min-width': `${minWidth}px`,
            '--select-box-menu-max-height': px(Math.floor(Math.min(ceiling, available))),
        }
    }

    function layoutInPlace(rect, viewport, wanted, ceiling) {
        const pad = VIEWPORT_PADDING
        const spaceBelow = Math.max(0, viewport.height - pad - rect.bottom)
        const spaceAbove = Math.max(0, rect.top - pad)
        const side = props.placement === 'right'
        const openUp = !side && wanted > spaceBelow && spaceAbove > spaceBelow
        menuOpensUpward.value = openUp
        const available = side ? Math.max(spaceBelow, spaceAbove) : (openUp ? spaceAbove : spaceBelow)
        const minWidth = getMinWidth(viewport.width)
        const style = {
            '--select-box-menu-max-height': px(Math.min(ceiling, available || ceiling)),
        }
        if (minWidth > 0) style['--select-box-menu-min-width'] = px(minWidth)
        return style
    }

    function updateMenuPosition() {
        if (!isOpen.value) return
        const trigger = getTrigger()
        if (!trigger) return
        const menu = menuEl.value
        showInTopLayer(menu)
        const html = document.documentElement
        const viewport = { width: html.clientWidth, height: html.clientHeight }
        const rect = getLayoutRect(trigger)
        const ceiling = props.menuMode === 'screen' ? Infinity : SELECT_BOX_MENU_MAX_HEIGHT
        const content = menu ? measureContentHeight(menu) : 0
        const wanted = Math.min(content || ESTIMATED_MENU_HEIGHT, ceiling)
        let placementVars
        if (!menuTopLayer) placementVars = layoutInPlace(rect, viewport, wanted, ceiling)
        else if (props.placement === 'right') placementVars = layoutSide(rect, menu, viewport, wanted, ceiling)
        else placementVars = layoutBelow(rect, viewport, wanted, ceiling)
        menuStyle.value = {
            ...placementVars,
            '--select-box-menu-gap': `${props.placementGap}px`,
        }
    }

    function onWindowScroll(event) {
        const menu = menuEl.value
        if (menu && event.target instanceof Node && menu.contains(event.target)) return
        const trigger = getTrigger()
        if (trigger && isClippedOut(trigger)) {
            onTriggerHidden?.()
            return
        }
        updateMenuPosition()
    }

    function attach() {
        window.addEventListener('resize', updateMenuPosition)
        if (menuTopLayer) window.addEventListener('scroll', onWindowScroll, true)
    }

    function detach() {
        window.removeEventListener('resize', updateMenuPosition)
        window.removeEventListener('scroll', onWindowScroll, true)
    }

    watch(isOpen, (open) => {
        if (open) {
            attach()
            return
        }
        detach()
        menuOpensUpward.value = false
    })

    onBeforeUnmount(detach)

    return { menuTopLayer, menuOpensUpward, menuStyle, updateMenuPosition }
}
