<template>
  <div class="document-viewer-sheet">
    <div v-if="sheets.length > 1" class="document-viewer-sheet__tabs" role="tablist" :aria-label="t('components.documentViewer.sheets')">
      <button v-for="(sheet, index) in sheets" :key="`${index}-${sheet.name}`" type="button" role="tab" class="document-viewer-sheet__tab" :class="{ 'document-viewer-sheet__tab--active': index === active }" :aria-selected="index === active" @click="active = index">
        {{ sheet.name }}
      </button>
    </div>
    <p v-if="current?.truncated" class="document-viewer-sheet__note">
      {{ t('components.documentViewer.sheetTruncated', { rows: SHEET_MAX_ROWS, cols: SHEET_MAX_COLS }) }}
    </p>
    <p v-if="!current || !current.rows.length" class="document-viewer-sheet__note">
      {{ t('components.documentViewer.sheetEmpty') }}
    </p>
    <div v-else class="document-viewer-sheet__scroll">
      <table class="document-viewer-sheet__table" :aria-label="current.name">
        <thead>
          <tr>
            <th class="document-viewer-sheet__corner" scope="col" aria-hidden="true" />
            <th v-for="col in current.columns" :key="col" scope="col" class="document-viewer-sheet__head">{{ columnName(col) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in current.rows" :key="row.number">
            <th scope="row" class="document-viewer-sheet__head document-viewer-sheet__row-head">{{ row.number }}</th>
            <td v-for="cell in row.cells" :key="cell.key" :rowspan="cell.rowspan > 1 ? cell.rowspan : undefined" :colspan="cell.colspan > 1 ? cell.colspan : undefined">{{ cell.text }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useAppI18n } from '@/i18n/useAppI18n.js'
import { SHEET_MAX_COLS, SHEET_MAX_ROWS, columnName } from '@/js/utils/documentViewerXlsx.js'

// Лист книги xlsx в DocumentViewer: вкладки листов и таблица с адресами строк и столбцов.
const props = defineProps({
  sheets: {
    type: Array,
    default: () => [],
  },
})

// rendered — таблица листа в DOM, просмотрщик заново ищет по ней строку поиска.
const emit = defineEmits(['rendered'])

const { t } = useAppI18n()
const active = ref(0)
const current = computed(() => props.sheets[active.value] || null)

watch(() => props.sheets, () => {
  active.value = 0
})

watch(current, async () => {
  await nextTick()
  emit('rendered')
}, { immediate: true })
</script>

<style scoped lang="scss">
@use '@/scss/ui/mixins' as *;

.document-viewer-sheet {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding: 0.75rem;
}

.document-viewer-sheet__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.document-viewer-sheet__tab {
  @include ui-a11y-focus;
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm, 0.375rem);
  background: var(--ui-surface);
  color: var(--ui-text-muted);
  font-size: 0.8125rem;
  cursor: pointer;
}

.document-viewer-sheet__tab--active {
  border-color: var(--ui-accent);
  background: color-mix(in srgb, var(--ui-accent) 12%, var(--ui-surface));
  color: var(--ui-text);
  font-weight: 600;
}

.document-viewer-sheet__note {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 0.8125rem;
}

.document-viewer-sheet__scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm, 0.375rem);
  background: var(--ui-surface);
}

.document-viewer-sheet__table {
  border-collapse: separate;
  border-spacing: 0;
  color: var(--ui-text);
  font-size: 0.8125rem;
  line-height: 1.35;

  td,
  th {
    padding: 0.3rem 0.5rem;
    border-right: 1px solid var(--ui-border);
    border-bottom: 1px solid var(--ui-border);
    vertical-align: top;
  }

  td {
    min-width: 4rem;
    max-width: 28rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
}

// Адреса столбцов и строк остаются на месте при прокрутке, как в редакторе таблиц.
.document-viewer-sheet__head {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--ui-surface-2, var(--ui-surface));
  color: var(--ui-text-muted);
  font-weight: 500;
  text-align: center;
  white-space: nowrap;
}

.document-viewer-sheet__row-head {
  top: auto;
  left: 0;
  z-index: 1;
}

.document-viewer-sheet__corner {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 2;
  background: var(--ui-surface-2, var(--ui-surface));
}
</style>
