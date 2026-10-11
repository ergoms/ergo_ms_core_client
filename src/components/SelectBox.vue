<template>
    <div class="select-box" ref="rootEl" v-csp-style="rootCssVars" v-bind="$attrs">
        <label v-if="label" class="form-label mb-1" :for="triggerId">{{ label }}</label>
        <div
            class="dropdown"
            :class="{ 'is-open': isOpen }"
            @mouseenter="onHoverZoneEnter"
            @mouseleave="onHoverZoneLeave"
        >
            <button
                :id="triggerId"
                class="btn btn-light w-100 d-flex align-items-center justify-content-between select-trigger"
                :class="{
                    'select-trigger--open': isOpen,
                    'select-trigger--open-up': isOpen && menuOpensUpward,
                }"
                type="button"
                :disabled="disabled"
                :aria-label="triggerAriaLabel"
                :aria-expanded="isOpen"
                :aria-controls="listboxId"
                aria-haspopup="listbox"
                @click="toggle"
                @blur="$emit('blur')"
            >
                <span class="select-trigger-slot d-flex align-items-center flex-grow-1 me-2">
                    <slot name="selected" :option="selectedOption" :label="currentLabel">
                        <span class="value-text">{{ currentLabel }}</span>
                    </slot>
                </span>
                <span v-if="!hideChevron" class="d-inline-flex align-items-center select-trigger-chevron" :class="{ 'select-trigger-chevron--open': isOpen }" aria-hidden="true"><LucideIcon name="ChevronDown" class="icon-center" /></span>
            </button>
            <teleport to="body">
                <div
                    v-if="isOpen"
                    ref="menuAnchorEl"
                    class="dropdown-menu show select-box-menu-teleport"
                    :class="{
                        'select-box-menu-teleport--up': menuOpensUpward,
                        'select-box-menu-teleport--side': placement === 'right',
                        'select-box-menu--uniform-font': uniformDropdownListFont,
                        [dropdownMenuClass]: Boolean(dropdownMenuClass),
                    }"
                    v-csp-style="menuAnchorStyle"
                    role="listbox"
                    :id="listboxId"
                    :aria-labelledby="triggerId"
                    @mouseenter="onHoverZoneEnter"
                    @mouseleave="onHoverZoneLeave"
                >
                        <input
                            v-if="searchable"
                            ref="searchInputEl"
                            v-model="searchQuery"
                            type="text"
                            class="select-box-search"
                            :placeholder="resolvedSearchPlaceholder"
                            :aria-label="resolvedSearchPlaceholder || t('components.selectBox.search')"
                            autocomplete="off"
                        />
                        <template v-if="!virtualized">
                            <ul class="dropdown-menu-list" role="presentation">
                                <li v-if="includeAllOption && !hasActiveSearch">
                                    <a class="dropdown-item" :class="{ active: multiple ? (modelValue?.length === 0) : isSelected(null) }" href="#" @click.prevent="choose(null)">{{ resolvedAllLabel }}</a>
                                </li>
                                <li v-if="!hasListContent">
                                    <span class="dropdown-item dropdown-item--empty" role="status">{{ t('components.selectBox.nothingFound') }}</span>
                                </li>
                                <li v-for="opt in filteredOptions" :key="opt.key">
                                    <a class="dropdown-item multi-line" :class="{ active: isSelected(opt.value) }" href="#" v-csp-style="getDropdownItemStyle(opt)" @click.prevent="choose(opt.value)">
                                        <slot name="option" :option="opt.raw" :label="opt.label" :value="opt.value" :active="isSelected(opt.value)" :depth="getOptionDepth(opt.raw)">
                                            <div v-if="multiple && showCheckboxesWhenMultiple" class="select-box-option-row">
                                                <input type="checkbox" :checked="isSelected(opt.value)" class="form-check-input select-box-option-checkbox" @change="() => {}" />
                                                <span class="select-box-option-label">
                                                    <template v-if="hasNestedLayout(opt)">
                                                        <span class="select-box-nested-option" :title="getOptionTitle(opt)">
                                                            <span v-if="getSecondaryLabel(opt.raw)" class="select-box-nested-option__secondary">{{ getSecondaryLabel(opt.raw) }}</span>
                                                            <span class="select-box-nested-option__primary">{{ opt.label }}</span>
                                                        </span>
                                                    </template>
                                                    <template v-else>{{ opt.label }}</template>
                                                </span>
                                            </div>
                                            <template v-else-if="hasNestedLayout(opt)">
                                                <span class="select-box-nested-option" :title="getOptionTitle(opt)">
                                                    <span v-if="getSecondaryLabel(opt.raw)" class="select-box-nested-option__secondary">{{ getSecondaryLabel(opt.raw) }}</span>
                                                    <span class="select-box-nested-option__primary">{{ opt.label }}</span>
                                                </span>
                                            </template>
                                            <span v-else>{{ opt.label }}</span>
                                        </slot>
                                    </a>
                                </li>
                            </ul>
                        </template>
                        <template v-else>
                            <ul v-if="!hasListContent" class="dropdown-menu-list" role="presentation">
                                <li>
                                    <span class="dropdown-item dropdown-item--empty" role="status">{{ t('components.selectBox.nothingFound') }}</span>
                                </li>
                            </ul>
                            <div v-else class="dropdown-menu-list-virtual-wrap">
                                <div ref="listContainerRef" class="dropdown-menu-list virtual-list-container" @scroll="onListScroll">
                                    <div class="virtual-list-spacer" v-csp-style="virtualSpacerStyle">
                                        <div class="virtual-list-inner" v-csp-style="virtualInnerStyle">
                                            <template v-for="opt in visibleOptions" :key="opt.key">
                                                <a v-if="opt.key === '__all__'" class="dropdown-item" :class="{ active: multiple ? (modelValue?.length === 0) : isSelected(null) }" href="#" v-csp-style="virtualItemStyle" @click.prevent="choose(null)">{{ opt.label }}</a>
                                                <a v-else class="dropdown-item multi-line" :class="{ active: isSelected(opt.value) }" href="#" v-csp-style="virtualItemStyleFor(opt)" @click.prevent="choose(opt.value)">
                                                    <slot name="option" :option="opt.raw" :label="opt.label" :value="opt.value" :active="isSelected(opt.value)" :depth="getOptionDepth(opt.raw)">
                                                        <div v-if="multiple && showCheckboxesWhenMultiple" class="select-box-option-row">
                                                            <input type="checkbox" :checked="isSelected(opt.value)" class="form-check-input select-box-option-checkbox" @change="() => {}" />
                                                            <span class="select-box-option-label">
                                                                <template v-if="hasNestedLayout(opt)">
                                                                    <span class="select-box-nested-option" :title="getOptionTitle(opt)">
                                                                        <span v-if="getSecondaryLabel(opt.raw)" class="select-box-nested-option__secondary">{{ getSecondaryLabel(opt.raw) }}</span>
                                                                        <span class="select-box-nested-option__primary">{{ opt.label }}</span>
                                                                    </span>
                                                                </template>
                                                                <template v-else>{{ opt.label }}</template>
                                                            </span>
                                                        </div>
                                                        <template v-else-if="hasNestedLayout(opt)">
                                                            <span class="select-box-nested-option" :title="getOptionTitle(opt)">
                                                                <span v-if="getSecondaryLabel(opt.raw)" class="select-box-nested-option__secondary">{{ getSecondaryLabel(opt.raw) }}</span>
                                                                <span class="select-box-nested-option__primary">{{ opt.label }}</span>
                                                            </span>
                                                        </template>
                                                        <span v-else>{{ opt.label }}</span>
                                                    </slot>
                                                </a>
                                            </template>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </template>
                </div>
            </teleport>
        </div>
    </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick, useId } from 'vue'
import LucideIcon from '@/components/LucideIcon.vue'
import { OVERLAY_MENU_Z_INDEX } from '@/js/utils/overlayZIndex.js'
import { getTopZIndex } from '@/js/utils/modalStack.js'
import { computeSelectBoxMenuLayout, resolveSelectBoxMenuZIndex } from '@/js/utils/selectBoxMenuPosition.js'
import { useAppI18n } from '@/i18n/useAppI18n.js'

defineOptions({ inheritAttrs: false })

const { t } = useAppI18n()

const NULL_VALUE = 'null'

const props = defineProps({
    modelValue: { type: [String, Number, Boolean, Object, Array, null], default: null },
    options: { type: Array, default: () => [] },
    id: { type: String, default: '' },
    label: { type: String, default: '' },
    ariaLabel: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
    clearable: { type: Boolean, default: false },
    includeAllOption: { type: Boolean, default: true },
    allLabel: { type: String, default: undefined },
    valueKey: { type: String, default: 'id' },
    labelKey: { type: String, default: 'name' },
    size: { type: String, default: 'md' },
    castToNumber: { type: Boolean, default: false },
    currentLabelFormatter: { type: Function, default: null },
    fullWidth: { type: Boolean, default: true },
    maxSelectedChars: { type: [Number, null], default: null },
    hideChevron: { type: Boolean, default: false },
    dropdownAnchorRef: { type: Object, default: null },
    searchable: { type: Boolean, default: false },
    searchPlaceholder: { type: String, default: undefined },
    searchByFirstLetters: { type: Boolean, default: false },
    /** Ключ доп. поля в объекте опции для поиска (помимо label); пусто — только label */
    searchExtraKey: { type: String, default: '' },
    multiple: { type: Boolean, default: false },
    showCheckboxesWhenMultiple: { type: Boolean, default: false },
    multipleLabelFormat: { type: String, default: 'list', validator: (v) => ['count', 'list'].includes(v) },
    virtualized: { type: Boolean, default: false },
    itemHeight: { type: Number, default: 36 },
    overscan: { type: Number, default: 6 },
    /** Минимальная ширина выпадающего меню (может быть шире триггера) */
    dropdownMinWidth: { type: Number, default: 0 },
    /** Доп. класс на выпадающее меню (teleport в body — для стилей с :global у потребителя) */
    dropdownMenuClass: { type: String, default: '' },
    /** Одинаковый размер шрифта у всех пунктов списка, включая active (компактные тулбары) */
    uniformDropdownListFont: { type: Boolean, default: false },
    /** Ключ глубины вложенности в объекте опции (пусто — без иерархии) */
    depthKey: { type: String, default: '' },
    /** Доп. отступ слева на уровень вложенности, rem; 0 — без отступа */
    optionIndentPerLevel: { type: Number, default: 0 },
    /** Ключ доп. подписи (вторая строка) в объекте опции */
    secondaryLabelKey: { type: String, default: '' },
    /** Размер шрифта основной подписи вложенного пункта; пусто — как у списка */
    nestedOptionFontSize: { type: String, default: '' },
    /** Размер шрифта доп. подписи; пусто — как у списка */
    nestedSecondaryFontSize: { type: String, default: '' },
    /** Сторона раскрытия меню: 'bottom' (по умолчанию) — под триггером, 'right' — сбоку справа (для пунктов-подменю) */
    placement: { type: String, default: 'bottom', validator: (v) => ['bottom', 'right'].includes(v) },
    /** Зазор в px между триггером и меню при placement="right" (0 — меню примыкает к триггеру) */
    placementGap: { type: Number, default: 4 },
    /** Вертикальное выравнивание меню при placement="right": 'start' (по умолчанию, верх меню = верх триггера) | 'center' (центр меню = центр триггера) */
    placementAlign: { type: String, default: 'start', validator: (v) => ['start', 'center'].includes(v) },
    /** Открывать выпадающий список при наведении (удобно для подменю, напр. выбор темы в SettingsMenu) */
    openOnHover: { type: Boolean, default: false },
    /** Задержка закрытия при уходе курсора, ms — чтобы успеть перейти с триггера на телепортированное меню */
    hoverCloseDelay: { type: Number, default: 120 },
})

const emit = defineEmits(['update:modelValue', 'change', 'blur', 'search'])

const generatedId = useId()
const triggerId = computed(() => props.id || generatedId)
const listboxId = computed(() => `${triggerId.value}-listbox`)
const triggerAriaLabel = computed(() => (props.label ? undefined : (props.ariaLabel || undefined)))

const rootCssVars = computed(() => {
    const vars = {}
    if (props.optionIndentPerLevel) {
        vars['--select-box-nested-indent-per-level'] = `${props.optionIndentPerLevel}rem`
    }
    if (props.nestedOptionFontSize) {
        vars['--select-box-nested-font-size'] = props.nestedOptionFontSize
    }
    if (props.nestedSecondaryFontSize) {
        vars['--select-box-nested-secondary-font-size'] = props.nestedSecondaryFontSize
    }
    return Object.keys(vars).length ? vars : undefined
})

function getOptionDepth(raw) {
    if (!props.depthKey || raw == null || typeof raw !== 'object') return 0
    const value = raw[props.depthKey]
    const num = Number(value)
    return Number.isFinite(num) ? Math.max(0, num) : 0
}

function getSecondaryLabel(raw) {
    if (!props.secondaryLabelKey || raw == null || typeof raw !== 'object') return ''
    const value = raw[props.secondaryLabelKey]
    if (value == null) return ''
    const text = String(value).trim()
    return text || ''
}

function hasNestedLayout(opt) {
    return getOptionDepth(opt.raw) > 0 || Boolean(getSecondaryLabel(opt.raw))
}

function getOptionTitle(opt) {
    const secondary = getSecondaryLabel(opt.raw)
    if (secondary) return `${secondary} › ${opt.label}`
    return opt.label
}

function getDropdownItemStyle(opt) {
    const depth = getOptionDepth(opt.raw)
    if (depth <= 0 || props.optionIndentPerLevel <= 0) return undefined
    return {
        paddingLeft: `calc(var(--select-box-item-padding-x) + ${depth * props.optionIndentPerLevel}rem)`,
    }
}

function toKey(value) {
    if (value === null || value === undefined) return NULL_VALUE
    const type = typeof value
    if (type === 'object') return `${type}:${JSON.stringify(value)}`
    return `${type}:${String(value)}`
}

const normalizedOptions = computed(() => {
    const result = []
    for (const raw of props.options) {
        const isObject = typeof raw === 'object' && raw !== null
        const value = isObject ? raw[props.valueKey] : raw
        const label = isObject ? (raw[props.labelKey] ?? String(value ?? '')) : String(raw ?? '')
        result.push({ key: toKey(value), value, label, raw })
    }
    return result
})

function matchesFirstLetters(label, query) {
    const words = (label || '').split(/[\s-]+/).filter(Boolean)
    const q = query.toLowerCase()
    let wordIdx = 0
    let charIdx = 0
    while (charIdx < q.length && wordIdx < words.length) {
        const firstChar = words[wordIdx].charAt(0).toLowerCase()
        if (firstChar === q.charAt(charIdx)) charIdx++
        wordIdx++
    }
    return charIdx === q.length
}

const searchQuery = ref('')
const hasActiveSearch = computed(() => props.searchable && searchQuery.value.trim().length > 0)

function getSearchExtraText(opt) {
    if (!props.searchExtraKey || opt?.raw == null || typeof opt.raw !== 'object') return ''
    const value = opt.raw[props.searchExtraKey]
    if (value == null) return ''
    return String(value).trim()
}

const filteredOptions = computed(() => {
    if (!props.searchable || !searchQuery.value.trim()) return normalizedOptions.value
    const q = searchQuery.value.trim()
    const qLower = q.toLowerCase()
    if (props.searchByFirstLetters) {
        return normalizedOptions.value.filter(opt => {
            const label = opt.label ?? ''
            const labelLower = label.toLowerCase()
            const extraLower = getSearchExtraText(opt).toLowerCase()
            return (
                matchesFirstLetters(label, q)
                || labelLower.includes(qLower)
                || (extraLower && extraLower.includes(qLower))
            )
        })
    }
    return normalizedOptions.value.filter((opt) => {
        const labelLower = (opt.label ?? '').toLowerCase()
        if (labelLower.includes(qLower)) return true
        const extraLower = getSearchExtraText(opt).toLowerCase()
        return Boolean(extraLower && extraLower.includes(qLower))
    })
})

const hasListContent = computed(() => {
    if (props.includeAllOption && !hasActiveSearch.value) return true
    return filteredOptions.value.length > 0
})

const isOpen = ref(false)
const menuOpensUpward = ref(false)
/** Как у DropDown: fixed + CSS-переменные, без обёртки height:0. */
const menuAnchorStyle = ref({
    '--select-box-menu-top': '-9999px',
    '--select-box-menu-left': '0px',
    '--select-box-menu-width': 'auto',
    '--select-box-menu-max-height': 'min(80vh, calc(100vh - 16px))',
    '--select-box-menu-z': String(OVERLAY_MENU_Z_INDEX),
})
const menuAnchorEl = ref(null)
let suppressOutsideClick = false

function resolveContextFontSize(trigger, root) {
    if (!trigger) return '1rem'
    const triggerStyle = getComputedStyle(trigger)
    if (triggerStyle.fontSize) return triggerStyle.fontSize
    if (root) {
        const rootStyle = getComputedStyle(root)
        if (rootStyle.fontSize) return rootStyle.fontSize
    }
    return '1rem'
}

function buildMenuCssVars(trigger, root) {
    const triggerStyle = getComputedStyle(trigger)
    const rootStyle = root ? getComputedStyle(root) : null
    const menuFontSize = resolveContextFontSize(trigger, root)
    const customFontSize = rootStyle?.getPropertyValue('--select-box-font-size').trim()
    const resolvedMenuFontSize = customFontSize || menuFontSize
    const menuLineHeight = triggerStyle.lineHeight || rootStyle?.lineHeight || '1.5'
    return {
        fontSize: resolvedMenuFontSize,
        lineHeight: menuLineHeight,
        '--select-box-font-size': resolvedMenuFontSize,
        '--select-box-search-font-size': rootStyle?.getPropertyValue('--select-box-search-font-size').trim() || '1em',
        '--select-box-compact-font-size': rootStyle?.getPropertyValue('--select-box-compact-font-size').trim() || '1em',
        '--select-box-item-padding-y': rootStyle?.getPropertyValue('--select-box-item-padding-y').trim() || '0.375rem',
        '--select-box-item-padding-x': rootStyle?.getPropertyValue('--select-box-item-padding-x').trim() || '0.75rem',
        '--select-box-nested-indent-per-level': rootStyle?.getPropertyValue('--select-box-nested-indent-per-level').trim() || `${props.optionIndentPerLevel}rem`,
        '--select-box-nested-font-size': props.nestedOptionFontSize
            || rootStyle?.getPropertyValue('--select-box-nested-font-size').trim()
            || '1em',
        '--select-box-nested-secondary-font-size': props.nestedSecondaryFontSize
            || rootStyle?.getPropertyValue('--select-box-nested-secondary-font-size').trim()
            || props.nestedOptionFontSize
            || '1em',
    }
}

function resolveMenuZIndex() {
    return resolveSelectBoxMenuZIndex(OVERLAY_MENU_Z_INDEX, getTopZIndex())
}

function hiddenMenuStyle() {
    return {
        '--select-box-menu-top': '-9999px',
        '--select-box-menu-left': '0px',
        '--select-box-menu-width': 'auto',
        '--select-box-menu-max-height': 'min(80vh, calc(100vh - 16px))',
        '--select-box-menu-z': String(resolveMenuZIndex()),
    }
}

function updateMenuPosition() {
    if (!isOpen.value) return
    const root = rootEl.value
    if (!root) return
    const trigger = root.querySelector('.select-trigger')
    if (!trigger) return
    const triggerRect = trigger.getBoundingClientRect()
    const anchorEl = props.dropdownAnchorRef?.value
    const anchorRect = anchorEl ? anchorEl.getBoundingClientRect() : null
    const vv = window.visualViewport
    const layout = computeSelectBoxMenuLayout({
        placement: props.placement,
        placementAlign: props.placementAlign,
        placementGap: props.placementGap,
        dropdownMinWidth: props.dropdownMinWidth,
        triggerRect,
        anchorRect,
        measuredHeight: menuAnchorEl.value?.getBoundingClientRect().height || 0,
        vw: vv?.width ?? window.innerWidth,
        vh: vv?.height ?? window.innerHeight,
        offsetTop: vv?.offsetTop ?? 0,
        offsetLeft: vv?.offsetLeft ?? 0,
    })

    menuOpensUpward.value = layout.openUp
    const fontVars = buildMenuCssVars(trigger, root)
    menuAnchorStyle.value = {
        ...fontVars,
        '--select-box-menu-top': `${layout.top}px`,
        '--select-box-menu-left': `${layout.left}px`,
        '--select-box-menu-width': `${layout.width}px`,
        '--select-box-menu-max-height': `${Math.max(0, layout.maxHeight)}px`,
        '--select-box-menu-z': String(resolveMenuZIndex()),
    }
}
const searchInputEl = ref(null)
let hoverCloseTimer = null

function clearHoverCloseTimer() {
    if (hoverCloseTimer !== null) {
        clearTimeout(hoverCloseTimer)
        hoverCloseTimer = null
    }
}

function scheduleHoverClose() {
    if (!props.openOnHover) return
    clearHoverCloseTimer()
    hoverCloseTimer = setTimeout(() => {
        close()
        hoverCloseTimer = null
    }, props.hoverCloseDelay)
}

function onHoverZoneEnter() {
    if (!props.openOnHover || props.disabled) return
    clearHoverCloseTimer()
    open()
}

function onHoverZoneLeave() {
    if (!props.openOnHover) return
    scheduleHoverClose()
}

function open() {
    if (props.disabled || isOpen.value) return
    isOpen.value = true
    // Иначе document click того же жеста закрывает меню (Яндекс.Браузер, searchable).
    suppressOutsideClick = true
    nextTick(() => {
        updateMenuPosition()
        requestAnimationFrame(() => {
            updateMenuPosition()
            if (props.searchable) {
                searchInputEl.value?.focus({ preventScroll: true })
            }
            requestAnimationFrame(() => {
                suppressOutsideClick = false
            })
        })
    })
    if (props.virtualized) {
        startIndex.value = 0
        endIndex.value = 0
        nextTick(() => {
            if (listContainerRef.value) {
                listContainerRef.value.scrollTop = 0
                updateVisibleRange()
            }
        })
    }
}

function toggle() {
    if (props.disabled) return
    if (isOpen.value) close()
    else open()
}

function close() {
    clearHoverCloseTimer()
    suppressOutsideClick = false
    isOpen.value = false
    searchQuery.value = ''
    menuAnchorStyle.value = hiddenMenuStyle()
}

function coerce(val) {
    if (val === null || val === undefined) return null
    if (props.castToNumber) {
        const n = Number(val)
        return Number.isFinite(n) ? n : null
    }
    return val
}

function choose(value) {
    if (props.multiple && Array.isArray(props.modelValue)) {
        if (value === null || value === undefined) {
            emit('update:modelValue', [])
            emit('change', [])
            return
        }
        const v = coerce(value)
        const arr = [...props.modelValue]
        const idx = arr.findIndex((item) => valuesAreEqual(item, v))
        if (idx >= 0) arr.splice(idx, 1)
        else arr.push(v)
        emit('update:modelValue', arr)
        emit('change', arr)
        return
    }
    const v = coerce(value)
    emit('update:modelValue', v)
    emit('change', v)
    close()
}

const resolvedAllLabel = computed(
    () => props.allLabel ?? t('components.selectBox.notSelected'),
)
const resolvedSearchPlaceholder = computed(
    () => props.searchPlaceholder ?? t('components.selectBox.searchPlaceholder'),
)

const rawCurrentLabel = computed(() => {
    if (props.multiple && Array.isArray(props.modelValue)) {
        if (!props.modelValue.length) return resolvedAllLabel.value
        if (props.multipleLabelFormat === 'count' && props.modelValue.length > 1) {
            return t('components.selectBox.selectedCount', { count: props.modelValue.length })
        }
        if (props.multipleLabelFormat === 'count' && props.modelValue.length === 1) {
            const val = props.modelValue[0]
            const found = normalizedOptions.value.find((o) => valuesAreEqual(o.value, val))
            return found ? found.label : String(val)
        }
        const labels = props.modelValue.map((val) => {
            const found = normalizedOptions.value.find((o) => valuesAreEqual(o.value, val))
            return found ? found.label : String(val)
        })
        return labels.join(', ')
    }
    if (props.modelValue === null || props.modelValue === undefined || props.modelValue === '') {
        return resolvedAllLabel.value
    }
    const found = normalizedOptions.value.find(o => valuesAreEqual(o.value, props.modelValue))
    if (!found) return resolvedAllLabel.value
    if (typeof props.currentLabelFormatter === 'function') {
        try { return props.currentLabelFormatter({ option: found.raw, value: found.value, label: found.label }) } catch { return found.label }
    }
    return found.label
})

const currentLabel = computed(() => {
    const label = rawCurrentLabel.value ?? ''
    const limit = props.maxSelectedChars
    if (typeof limit === 'number' && limit > 0 && label.length > limit) {
        return label.slice(0, Math.max(0, limit - 1)) + '…'
    }
    return label
})

const selectedOption = computed(() => {
    const found = normalizedOptions.value.find(o => valuesAreEqual(o.value, props.modelValue))
    return found ? found.raw : null
})

function valuesAreEqual(a, b) {
    const aNil = a === null || a === undefined || a === ''
    const bNil = b === null || b === undefined || b === ''
    if (aNil || bNil) return aNil && bNil
    if (typeof a === 'object' || typeof b === 'object') {
        try { return JSON.stringify(a) === JSON.stringify(b) } catch { return false }
    }
    return String(a) === String(b)
}

function isSelected(val) {
    if (props.multiple && Array.isArray(props.modelValue)) {
        return props.modelValue.some((item) => valuesAreEqual(item, val))
    }
    return valuesAreEqual(props.modelValue, val)
}

function handleClickOutside(e) {
    if (suppressOutsideClick || !isOpen.value) return
    const root = rootEl.value
    if (!root) return
    if (menuAnchorEl.value?.contains(e.target)) return
    if (!root.contains(e.target)) close()
}

const rootEl = ref(null)
const listContainerRef = ref(null)
const listScrollTop = ref(0)
const listViewportHeight = ref(260)
const startIndex = ref(0)
const endIndex = ref(0)

const effectiveOptionsForVirtual = computed(() => {
    if (!props.virtualized) return []
    const list = filteredOptions.value
    if (props.includeAllOption && !hasActiveSearch.value) {
        return [{ key: '__all__', value: null, label: resolvedAllLabel.value, raw: null }, ...list]
    }
    return list
})

const totalHeight = computed(() => (props.virtualized ? effectiveOptionsForVirtual.value.length * props.itemHeight : 0))
const virtualSpacerStyle = computed(() => ({
    height: `${totalHeight.value}px`,
    position: 'relative',
}))
const virtualInnerStyle = computed(() => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    transform: `translateY(${virtualOffsetY.value}px)`,
}))
const virtualItemStyle = computed(() => ({
    minHeight: `${props.itemHeight}px`,
}))
function virtualItemStyleFor(opt) {
    return {
        ...virtualItemStyle.value,
        ...getDropdownItemStyle(opt),
    }
}
const visibleOptions = computed(() => {
    if (!props.virtualized) return filteredOptions.value
    const list = effectiveOptionsForVirtual.value
    const start = Math.max(0, startIndex.value)
    const end = Math.min(list.length, endIndex.value)
    return list.slice(start, end)
})
const virtualOffsetY = computed(() => (props.virtualized ? startIndex.value * props.itemHeight : 0))

function updateVisibleRange() {
    if (!props.virtualized || !listContainerRef.value) return
    const el = listContainerRef.value
    listViewportHeight.value = el.clientHeight
    const scrollTop = el.scrollTop
    listScrollTop.value = scrollTop
    const count = effectiveOptionsForVirtual.value.length
    const start = Math.max(0, Math.floor(scrollTop / props.itemHeight) - props.overscan)
    const end = Math.min(count, Math.ceil((scrollTop + el.clientHeight) / props.itemHeight) + props.overscan)
    startIndex.value = start
    endIndex.value = end
}

function onListScroll() {
    updateVisibleRange()
}

const onResize = () => {
    if (!isOpen.value) return
    updateMenuPosition()
}
onMounted(() => {
    document.addEventListener('click', handleClickOutside, true)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    window.visualViewport?.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('scroll', onResize)
})
onBeforeUnmount(() => {
    clearHoverCloseTimer()
    document.removeEventListener('click', handleClickOutside, true)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('scroll', onResize, true)
    window.visualViewport?.removeEventListener('resize', onResize)
    window.visualViewport?.removeEventListener('scroll', onResize)
})

watch([() => (props.virtualized ? effectiveOptionsForVirtual.value.length : filteredOptions.value.length), isOpen], () => {
    if (props.virtualized && isOpen.value) {
        nextTick(updateVisibleRange)
    }
})

watch(searchQuery, (value) => {
    emit('search', String(value || ''))
    if (props.virtualized && isOpen.value && listContainerRef.value) {
        listContainerRef.value.scrollTop = 0
        nextTick(updateVisibleRange)
    }
})
</script>

<style scoped lang="scss">
@import "./SelectBox.scoped.scss";
</style>

<style lang="scss">
@import "./SelectBox.global.scss";
</style>