<script setup>
import { computed, ref, watch, onBeforeUnmount, nextTick } from 'vue'
import {
  pushModal,
  popModal,
  isTopModal,
  acquireScrollLock,
  releaseScrollLock,
} from '@/js/utils/modalStack.js'
import { hideAllHoverTooltips } from '@/js/utils/hoverTooltipLayer.js'
import { activateFocusTrap } from '@/js/utils/focusTrap.js'
import { useAppI18n } from '@/i18n/useAppI18n.js'

const { t } = useAppI18n()

const SIZE_CLASS_MAP = {
  sm: 'modal-sm',
  lg: 'modal-lg',
  xl: 'modal-xl',
  fullscreen: 'modal-fullscreen',
}

const props = defineProps({
  modalId: { type: String, default: 'centralModal' },
  customClass: { type: String, default: '' },
  title: { type: String, default: '' },
  showTitle: { type: Boolean, default: true },
  showCloseButton: { type: Boolean, default: true },
  modalAriaLabel: { type: String, default: '' },
  showFooter: { type: Boolean, default: false },
  dialogClass: { type: String, default: '' },
  bodyClass: { type: String, default: '' },
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md', 'lg', 'xl', 'fullscreen'].includes(v),
  },
  centered: { type: Boolean, default: true },
  scrollable: { type: Boolean, default: true },
  keyboard: { type: Boolean, default: true },
  backdrop: { type: [Boolean, String], default: true },
  backdropEffect: {
    type: String,
    default: 'dim',
    validator: (v) => ['dim', 'blur', 'both'].includes(v),
  },
  backdropBlur: { type: Number, default: 4 },
  standalone: { type: Boolean, default: false },
  visible: { type: Boolean, default: false },
  closeOnBackdrop: { type: Boolean, default: true },
  closeOnEsc: { type: Boolean, default: true },
  lockBodyScroll: { type: Boolean, default: true },
  zIndex: { type: [Number, String], default: null },
  dialogStyle: { type: [Object, String], default: null },
})

const emit = defineEmits(['close', 'closemodal'])

const stackZIndex = ref(null)
const standaloneRootRef = ref(null)
let isStacked = false
let deactivateFocusTrap = null

const titleId = computed(() => `${props.modalId}Label`)

const rootAriaLabelledby = computed(() =>
  props.showTitle ? titleId.value : undefined,
)

const rootAriaLabel = computed(() => {
  if (props.showTitle) return undefined
  return props.modalAriaLabel || undefined
})

const dialogComputedClass = computed(() => {
  const classes = []
  if (props.centered) classes.push('modal-dialog-centered')
  if (props.scrollable) classes.push('modal-dialog-scrollable')
  const sizeClass = SIZE_CLASS_MAP[props.size]
  if (sizeClass) classes.push(sizeClass)
  if (props.dialogClass) classes.push(props.dialogClass)
  return classes
})

const resolvedZIndex = computed(() => {
  if (props.zIndex != null && props.zIndex !== '') {
    return props.zIndex
  }
  return stackZIndex.value
})

const standaloneBackdropClass = computed(() => `mc-standalone--${props.backdropEffect}`)

const standaloneRootStyle = computed(() => {
  const blurPx = Number.isFinite(props.backdropBlur) ? Math.max(0, props.backdropBlur) : 4
  const style = {
    '--mc-backdrop-blur': `${blurPx}px`,
  }
  const value = resolvedZIndex.value
  if (value != null && value !== '') {
    style['--bs-modal-zindex'] = value
    style.zIndex = value
  }
  return style
})

const handleClose = (reason = 'button') => {
  emit('close', reason)
  emit('closemodal', reason)
}

const onBackdropClick = () => {
  if (!props.standalone || !props.closeOnBackdrop || !isTopModal(props.modalId)) {
    return
  }
  handleClose('backdrop')
}

const onKeydown = (e) => {
  if (e.key !== 'Escape') return
  if (!props.standalone || !props.closeOnEsc || !props.visible) return
  if (!isTopModal(props.modalId)) return
  handleClose('escape')
}

const registerInStack = () => {
  if (isStacked) return

  const explicitZIndex = props.zIndex != null && props.zIndex !== ''
    ? Number(props.zIndex)
    : null
  stackZIndex.value = pushModal(props.modalId, explicitZIndex)
  if (props.lockBodyScroll) {
    acquireScrollLock()
  }
  isStacked = true
}

const unregisterFromStack = () => {
  if (!isStacked) return

  popModal(props.modalId)
  if (props.lockBodyScroll) {
    releaseScrollLock()
  }
  isStacked = false
  stackZIndex.value = null
}

watch(
  () => props.standalone && props.visible,
  async (open) => {
    if (!props.standalone) return
    if (open) {
      registerInStack()
      document.addEventListener('keydown', onKeydown)
      await nextTick()
      deactivateFocusTrap?.()
      deactivateFocusTrap = activateFocusTrap(standaloneRootRef.value, {
        isActive: () => isTopModal(props.modalId),
      })
    } else {
      deactivateFocusTrap?.()
      deactivateFocusTrap = null
      unregisterFromStack()
      document.removeEventListener('keydown', onKeydown)
      // После закрытия: убрать тултип, если focus/synthetic mouseenter уже успели его поднять.
      hideAllHoverTooltips()
    }
  },
  // v-if + уже visible=true: без immediate модалка не попадает в modalStack
  { immediate: true },
)

onBeforeUnmount(() => {
  deactivateFocusTrap?.()
  deactivateFocusTrap = null
  document.removeEventListener('keydown', onKeydown)
  if (props.standalone) {
    unregisterFromStack()
  }
})
</script>

<template>
  <Teleport v-if="standalone" to="body">
    <div
      v-if="visible"
      :id="modalId"
      ref="standaloneRootRef"
      class="modal fade show d-block mc-standalone"
      :class="[customClass, standaloneBackdropClass]"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="rootAriaLabelledby"
      :aria-label="rootAriaLabel"
      :style="standaloneRootStyle"
      @mousedown.self="onBackdropClick"
    >
      <div class="modal-dialog mc-standalone__dialog" :class="dialogComputedClass" :style="dialogStyle" @mousedown.stop>
        <div class="modal-content">
          <div v-if="showTitle" class="modal-header">
            <h1 class="modal-title fs-5 d-flex align-items-center gap-2" :id="titleId">
              <slot name="title">{{ title }}</slot>
            </h1>
            <div class="modal-header__end">
              <slot name="header-actions" />
              <button v-if="showCloseButton" type="button" class="btn-close" :aria-label="t('components.modal.close')" @click.stop="handleClose"></button>
            </div>
          </div>
          <button
            v-else-if="!showTitle && showCloseButton"
            type="button"
            class="modal-content__floating-close btn-close"
            :aria-label="t('components.modal.close')"
            @click.stop="handleClose"
          ></button>
          <div class="modal-body" :class="bodyClass">
            <slot></slot>
          </div>

          <div v-if="$slots.footer" class="modal-footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.mc-standalone {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  z-index: var(--bs-modal-zindex);
  background-color: rgba(0, 0, 0, var(--bs-backdrop-opacity, 0.5));
  overflow-x: hidden;
  overflow-y: auto;
}

.mc-standalone--blur {
  background-color: rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(var(--mc-backdrop-blur, 4px));
  -webkit-backdrop-filter: blur(var(--mc-backdrop-blur, 4px));
}

.mc-standalone--both {
  backdrop-filter: blur(var(--mc-backdrop-blur, 4px));
  -webkit-backdrop-filter: blur(var(--mc-backdrop-blur, 4px));
}

:global(html[data-ergo-motion='reduce']) .mc-standalone--blur,
:global(html[data-ergo-motion='reduce']) .mc-standalone--both {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

:global(html[data-ergo-motion='reduce']) .mc-standalone--blur {
  background-color: rgba(0, 0, 0, var(--bs-backdrop-opacity, 0.5));
}

.mc-standalone__dialog {
  position: relative !important;
  z-index: 1 !important;
  margin: 1.75rem auto;
  pointer-events: auto;
  width: min(100% - 2rem, var(--bs-modal-width, 500px));
  max-width: calc(100% - 2rem);

  // Без scrollable диалог не должен занимать всю высоту оверлея —
  // иначе body с flex:1 растягивает пустое пространство до футера.
  &:not(.modal-dialog-scrollable) {
    height: auto;

    .modal-content {
      height: auto;
      max-height: min(90vh, 100%);
    }

    .modal-body {
      flex: 0 1 auto;
    }
  }

  @media (width < $ui-bp-sm) {
    margin: 0.5rem auto;
    width: calc(100% - 1rem);
    max-width: calc(100% - 1rem);

    &:not(.modal-dialog-scrollable) .modal-content {
      max-height: min(92dvh, 100%);
    }
  }
}

.modal-dialog {
  max-height: 90vh;

  @media (width < $ui-bp-sm) {
    margin: 0.5rem auto;
    max-width: calc(100% - 1rem);
  }
}

.modal-header {
  flex-shrink: 0;
  color: var(--color-primary-text);
  border-bottom: 1px solid var(--color-secondary-background);

  .modal-title :deep(svg) {
    display: block;
    flex-shrink: 0;
  }

  .btn-close:focus {
    box-shadow: none;
  }
}

.modal-header__end {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;

  .btn-close {
    margin-left: 0;
  }
}

.modal-footer {
  flex-shrink: 0;
}

.modal-content {
  position: relative;
  display: flex;
  flex-direction: column;
  max-height: 100%;
  min-height: 0;
  background-color: var(--color-primary-background);
  border: none;
  border-radius: $radius-usual;
}

.modal-content__floating-close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 10;

  &:focus {
    box-shadow: none;
  }
}

.modal-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-hover-background) transparent;
}
</style>
