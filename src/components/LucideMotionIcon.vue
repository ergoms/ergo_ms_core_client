<script setup>
/**
 * Анимированная Lucide-иконка по тому же имени, что LucideIcon.
 * Свои триггеры пакета рисуют чужой компонент Bell/Settings и глиф пропадает,
 * поэтому жест обрабатываем здесь и отдаём его в контекст, который читает сам глиф.
 * Глифа нет в пакете или включён режим «без анимаций» — остаётся LucideIcon.
 */
import { computed, getCurrentInstance, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { LUCIDE_STROKE_WIDTH } from '@/config/coreIconNames.js'
import { useUiModes } from '@/composables/useUiModes.js'
import { normalizeLucideIconName } from '@/js/lucideIconLoader.js'
import { getLucideAnimateIconKeyAsync, getLucideMotionIconAsync } from '@/js/lucideMotionIconLoader.js'

const props = defineProps({
  name: {
    type: String,
    default: '',
  },
  size: {
    type: [Number, String],
    default: 20,
  },
  strokeWidth: {
    type: [Number, String],
    default: LUCIDE_STROKE_WIDTH,
  },
  iconClass: {
    type: [String, Object, Array],
    default: '',
  },
  animate: {
    type: [Boolean, String],
    default: false,
  },
  animateOnHover: {
    type: [Boolean, String],
    default: false,
  },
  animateOnTap: {
    type: [Boolean, String],
    default: false,
  },
  animateOnView: {
    type: [Boolean, String],
    default: false,
  },
  animation: {
    type: String,
    default: '',
  },
  clip: {
    type: Boolean,
    default: false,
  },
  triggerTarget: {
    type: String,
    default: '',
  },
  persistOnAnimateEnd: {
    type: Boolean,
    default: false,
  },
  initialOnAnimateEnd: {
    type: Boolean,
    default: false,
  },
})

const { reducedMotionActive } = useUiModes()
const MotionIcon = shallowRef(null)
const hostRef = ref(null)
const variant = ref('initial')
const animationName = ref('default')
const instance = getCurrentInstance()
if (instance) {
  const parentProvides = instance.parent?.provides
  if (parentProvides === instance.provides) {
    instance.provides = Object.create(parentProvides)
  }
}
let requestId = 0
let startToken = 0
let attached = null
let viewObserver = null

const motionContext = {
  current: variant,
  animation: animationName,
  notifyComplete() {
    if (props.initialOnAnimateEnd && variant.value === 'animate') {
      variant.value = 'initial'
    }
  },
}

const sizePx = computed(() => {
  const raw = props.size
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(Math.round(raw))
  }
  const text = String(raw ?? '').trim()
  if (/^\d+(\.\d+)?$/.test(text)) {
    return String(Math.round(Number(text)))
  }
  return ''
})

const sizeCss = computed(() => {
  if (sizePx.value) {
    return `${sizePx.value}px`
  }
  const text = String(props.size ?? '').trim()
  return text || '1em'
})

const showStatic = computed(() => reducedMotionActive.value || !MotionIcon.value)

function start(trigger) {
  if (!trigger) {
    return
  }
  const token = ++startToken
  animationName.value = typeof trigger === 'string' ? trigger : (props.animation || 'default')
  variant.value = 'initial'
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      if (token !== startToken) {
        return
      }
      variant.value = 'animate'
    })
  } else {
    variant.value = 'animate'
  }
}

function stop() {
  startToken += 1
  if (props.persistOnAnimateEnd) {
    return
  }
  variant.value = 'initial'
}

function onEnter() {
  if (props.animateOnHover) {
    start(props.animateOnHover)
  }
}

function onLeave() {
  if (props.animateOnHover || props.animateOnTap) {
    stop()
  }
}

function onDown() {
  if (props.animateOnTap) {
    start(props.animateOnTap)
  }
}

function onUp() {
  if (props.animateOnTap) {
    stop()
  }
}

function detach() {
  if (attached) {
    attached.removeEventListener('mouseenter', onEnter)
    attached.removeEventListener('mouseleave', onLeave)
    attached.removeEventListener('pointerdown', onDown)
    attached.removeEventListener('pointerup', onUp)
    attached = null
  }
  if (viewObserver) {
    viewObserver.disconnect()
    viewObserver = null
  }
}

function resolveTarget(el) {
  if (!el) {
    return null
  }
  const target = props.triggerTarget
  if (!target || target === 'self') {
    return el
  }
  if (target === 'parent') {
    return el.parentElement
  }
  if (target.startsWith('closest:')) {
    const selector = target.slice('closest:'.length).trim()
    if (!selector) {
      return null
    }
    return el.parentElement?.closest(selector) ?? el.closest(selector)
  }
  return el
}

function attach(el) {
  detach()
  const target = resolveTarget(el)
  if (!target) {
    return
  }
  target.addEventListener('mouseenter', onEnter)
  target.addEventListener('mouseleave', onLeave)
  target.addEventListener('pointerdown', onDown)
  target.addEventListener('pointerup', onUp)
  attached = target
  if (props.animateOnView && typeof IntersectionObserver !== 'undefined') {
    viewObserver = new IntersectionObserver((entries) => {
      const visible = entries.some((entry) => entry.isIntersecting)
      if (visible) {
        start(props.animateOnView)
      } else {
        stop()
      }
    })
    viewObserver.observe(target)
  }
}

watch(() => props.animate, (trigger) => {
  if (trigger) {
    start(trigger)
  } else {
    stop()
  }
}, { immediate: true })

watch(() => props.animation, (name) => {
  if (name) {
    animationName.value = name
  }
}, { immediate: true })

watch(hostRef, (el) => {
  if (el) {
    attach(el)
  } else {
    detach()
  }
})

watch(
  () => [props.name, reducedMotionActive.value],
  async ([name, reduced]) => {
    const id = ++requestId
    if (reduced || !normalizeLucideIconName(name)) {
      MotionIcon.value = null
      return
    }
    const [component, key] = await Promise.all([
      getLucideMotionIconAsync(name),
      getLucideAnimateIconKeyAsync(),
    ])
    if (id !== requestId) {
      return
    }
    if (!component || !key || !instance) {
      MotionIcon.value = null
      return
    }
    instance.provides[key] = motionContext
    MotionIcon.value = component
    if (props.animate) {
      start(props.animate)
    }
  },
  { immediate: true },
)

onBeforeUnmount(detach)
</script>

<template>
  <LucideIcon v-if="showStatic" :name="name" :size="size" :stroke-width="strokeWidth" :icon-class="iconClass"/>
  <span v-else ref="hostRef" class="icon-flex lucide-icon-host" :data-icon-size="sizePx || null" v-csp-style="sizePx ? undefined : { width: sizeCss, height: sizeCss }">
    <component :is="MotionIcon" :size="size" :stroke-width="strokeWidth" :class="iconClass"/>
  </span>
</template>

<style scoped lang="scss">
.lucide-icon-host {
  width: 1em;
  height: 1em;
  line-height: 0;

  @for $size from 10 through 64 {
    &[data-icon-size='#{$size}'] {
      width: #{$size}px;
      height: #{$size}px;
    }
  }

  :deep(svg) {
    display: block;
    width: 100%;
    height: 100%;
    aspect-ratio: 1;
  }
}
</style>