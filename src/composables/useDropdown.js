import { ref, onMounted, onUnmounted, nextTick } from 'vue'

/**
 * Композабл для управления состоянием dropdown меню.
 * @param {Function} emit - функция emit из defineEmits
 * @param {Object} [options]
 * @param {() => (HTMLElement|null|undefined)[]} [options.getExtraNodes] - узлы вне корня (teleport)
 * @param {() => boolean} [options.onEscape] - true, если Esc обработан внутри и меню закрывать не нужно
 */
export function useDropdown(emit, options = {}) {
  const getExtraNodes = options.getExtraNodes ?? (() => [])
  const onEscape = options.onEscape ?? (() => false)

  const dropdownRef = ref(null)
  const isOpen = ref(false)
  let suppressOutsideClick = false

  function containsTarget(target) {
    if (!(target instanceof Node)) {
      return false
    }
    if (dropdownRef.value?.contains(target)) {
      return true
    }
    return getExtraNodes().some((node) => node?.contains?.(target))
  }

  const toggleDropdown = () => {
    const willOpen = !isOpen.value
    isOpen.value = willOpen
    emit('dropdown-toggle', willOpen)

    if (willOpen) {
      // Держим suppress дольше одного tick: иначе document click
      // в том же жесте успевает закрыть только что открытое меню.
      suppressOutsideClick = true
      nextTick(() => {
        requestAnimationFrame(() => {
          suppressOutsideClick = false
        })
      })
    }
  }

  const closeDropdown = () => {
    if (!isOpen.value) {
      return
    }
    isOpen.value = false
    emit('dropdown-toggle', false)
  }

  const handleClickOutside = (event) => {
    if (suppressOutsideClick || !isOpen.value) {
      return
    }
    if (!containsTarget(event.target)) {
      closeDropdown()
    }
  }

  /** Закрывает меню и возвращает фокус на кнопку-триггер (первая кнопка в корне), а не в body. */
  const closeAndFocusTrigger = () => {
    closeDropdown()
    nextTick(() => dropdownRef.value?.querySelector('button')?.focus({ preventScroll: true }))
  }

  const handleEscape = (event) => {
    // defaultPrevented — Esc уже забрал вложенный слой (модалка, своя панель).
    if (event.key !== 'Escape' || !isOpen.value || event.defaultPrevented) {
      return
    }
    event.preventDefault()
    if (onEscape()) {
      return
    }
    if (containsTarget(document.activeElement)) {
      closeAndFocusTrigger()
      return
    }
    closeDropdown()
  }

  onMounted(() => {
    document.addEventListener('click', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
  })

  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
    document.removeEventListener('keydown', handleEscape)
  })

  return {
    dropdownRef,
    isOpen,
    toggleDropdown,
    closeDropdown,
    closeAndFocusTrigger,
    containsTarget,
  }
}
