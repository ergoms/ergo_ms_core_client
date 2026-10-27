<template>
  <div class="file-card" :class="{ 'file-card--bordered': bordered }">
    <div class="file-card__main">
      <span v-if="resolvedIconUrl" class="file-card__icon" v-csp-style="{ backgroundImage: `url(${resolvedIconUrl})` }" aria-hidden="true"/>
      <span v-else class="file-card__icon file-card__icon--fallback" aria-hidden="true">
        <FileText :size="28" />
      </span>
      <div class="file-card__text">
        <div class="file-card__name">{{ resolvedFileName }}</div>
        <div v-if="metaLine" class="file-card__meta">{{ metaLine }}</div>
      </div>
    </div>
    <div class="file-card__actions">
      <slot name="actions">
        <template v-if="actions === 'icons'">
          <IconActionButton :text="resolvedDownloadLabel" :icon="Download" :stop-propagation="false" @click="onDownload"/>
          <IconActionButton v-if="removable" :text="removeLabel" :icon="Trash2" variant="danger" :stop-propagation="false" @click="$emit('remove')"/>
        </template>
        <button v-else type="button" class="btn btn-primary d-flex align-items-center gap-2" @click="onDownload">
          <Download :size="16" aria-hidden="true" />
          {{ resolvedDownloadLabel }}
        </button>
      </slot>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Download, FileText, Trash2 } from '@lucide/vue'
import docxIcon from '@/assets/icons/file-types/docx.svg'
import { formatFileSize } from '@/js/utils/file-helpers'
import { formatDate } from '@/js/utils/timeUtils.js'
import { useAppI18n } from '@/i18n/useAppI18n.js'
import IconActionButton from '@/components/IconActionButton.vue'

/** Иконки по расширению; при появлении pdf.svg / xlsx.svg — добавить сюда */
const FILE_TYPE_ICONS = {
  docx: docxIcon,
}

const props = defineProps({
  fileName: { type: String, default: '' },
  /** Fallback: извлечь имя из URL, если fileName пуст */
  fileUrl: { type: String, default: '' },
  /** Явный URL иконки (приоритетнее fileType) */
  icon: { type: String, default: '' },
  /** Тип файла для выбора иконки: docx, pdf, xlsx, … */
  fileType: { type: String, default: '' },
  /** Готовая строка метаданных; если задана — author/size/date не собираются */
  meta: { type: String, default: '' },
  authorName: { type: String, default: '' },
  sizeBytes: { type: [Number, String], default: null },
  uploadedAt: { type: [String, Date], default: null },
  downloadHref: { type: String, default: '' },
  downloadLabel: { type: String, default: '' },
  fallbackFileName: { type: String, default: '' },
  /** bordered — карточка с рамкой; plain — строка внутри зоны загрузки */
  bordered: { type: Boolean, default: true },
  /** download-button — прямоугольная кнопка; icons — IconActionButton */
  actions: {
    type: String,
    default: 'download-button',
    validator: (value) => ['download-button', 'icons'].includes(value),
  },
  removable: { type: Boolean, default: false },
})

const emit = defineEmits(['download', 'remove'])

const { t } = useAppI18n()

const resolvedDownloadLabel = computed(() => props.downloadLabel || t('components.fileCard.download'))
const removeLabel = computed(() => t('components.fileCard.remove'))
const resolvedFallbackName = computed(() => props.fallbackFileName || t('components.fileCard.fallbackName'))

const fileKey = computed(() => {
  const fromName = (props.fileName || props.fileUrl || props.downloadHref || '')
    .split(/[?#]/)[0]
    .split(/[/\\]/)
    .pop()
    ?.split('.')
    .pop()
  return String(props.fileType || fromName || '')
    .toLowerCase()
    .replace(/^\./, '')
})

const resolvedIconUrl = computed(() => {
  if (props.icon) return props.icon
  return FILE_TYPE_ICONS[fileKey.value] || ''
})

const resolvedFileName = computed(() => {
  const name = (props.fileName || '').trim()
  if (name) return name
  const url = props.fileUrl || props.downloadHref || ''
  if (!url) return resolvedFallbackName.value
  try {
    const path = decodeURIComponent(String(url).split('?')[0])
    const base = path.replace(/\\/g, '/').split('/').filter(Boolean).pop()
    return base || resolvedFallbackName.value
  } catch {
    return resolvedFallbackName.value
  }
})

function formatUploadDateTime(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const datePart = formatDate(d)
  if (!datePart) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${datePart}, ${hh}:${mm}`
}

const metaLine = computed(() => {
  const custom = (props.meta || '').trim()
  if (custom) return custom
  const parts = []
  const author = (props.authorName || '').trim()
  if (author) parts.push(author)
  if (props.sizeBytes != null && props.sizeBytes !== '' && Number(props.sizeBytes) >= 0) {
    parts.push(formatFileSize(Number(props.sizeBytes)))
  }
  const when = formatUploadDateTime(props.uploadedAt)
  if (when) parts.push(when)
  return parts.join(' · ')
})

function onDownload(event) {
  emit('download', event)
}
</script>

<style scoped lang="scss">
.file-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;

  &--bordered {
    padding: 0.75rem 1rem;
    border: 1px solid var(--ui-border, var(--bs-border-color, var(--color-border)));
    border-radius: var(--ui-radius-md, 0.375rem);
    background: var(--ui-surface, var(--color-primary-background, var(--bs-body-bg)));
  }
}

.file-card__main {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.file-card__text {
  min-width: 0;
}

.file-card__icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
  color: var(--ui-text);
}

.file-card__name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text);
}

.file-card__meta {
  margin-top: 0.1rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-muted);
  font-size: 0.8125rem;
}

.file-card__actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex: 0 0 auto;
}
</style>