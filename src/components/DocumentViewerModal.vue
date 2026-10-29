<template>
  <ModalCenter
    standalone
    :modal-id="modalId"
    :visible="visible"
    :title="title || t('components.documentViewer.title')"
    size="fullscreen"
    :scrollable="false"
    :centered="false"
    custom-class="document-viewer-modal"
    body-class="p-0"
    @close="emit('close')"
  >
    <DocumentViewerLegend
      v-if="visible && highlight"
      :current-label="legendCurrent || t('components.documentViewer.legendCurrent')"
      :other-label="legendOther || t('components.documentViewer.legendOther')"
    />
    <DocumentViewer
      v-if="visible"
      :src="src"
      :filename="filename"
      :highlight="highlight"
    />
  </ModalCenter>
</template>

<script setup>
import { defineAsyncComponent } from 'vue'
import ModalCenter from '@/components/ModalCenter.vue'
import { useAppI18n } from '@/i18n/useAppI18n.js'
import DocumentViewerLegend from '@/components/DocumentViewerLegend.vue'

const DocumentViewer = defineAsyncComponent(() => import('@/components/DocumentViewer.vue'))

defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  src: {
    type: String,
    default: '',
  },
  filename: {
    type: String,
    default: '',
  },
  title: {
    type: String,
    default: '',
  },
  highlight: {
    type: String,
    default: '',
  },
  legendCurrent: {
    type: String,
    default: '',
  },
  legendOther: {
    type: String,
    default: '',
  },
  modalId: {
    type: String,
    default: 'documentViewer',
  },
})

const emit = defineEmits(['close'])
const { t } = useAppI18n()
</script>

<style lang="scss">
// ModalCenter без scrollable сжимает standalone-диалог до ~500px —
// size="fullscreen" тогда не действует. Нужен почти весь viewport.
.document-viewer-modal {
  .mc-standalone__dialog,
  .mc-standalone__dialog:not(.modal-dialog-scrollable),
  .modal-dialog {
    width: calc(100% - 1.5rem) !important;
    max-width: calc(100% - 1.5rem) !important;
    height: min(96dvh, calc(100% - 1.5rem)) !important;
    max-height: 96dvh !important;
    margin: 0.75rem auto !important;
  }

  .modal-content,
  .mc-standalone__dialog:not(.modal-dialog-scrollable) .modal-content {
    display: flex;
    flex-direction: column;
    height: 100% !important;
    max-height: 96dvh !important;
  }

  .modal-body,
  .mc-standalone__dialog:not(.modal-dialog-scrollable) .modal-body {
    display: flex;
    flex: 1 1 auto !important;
    flex-direction: column;
    min-height: 0;
    height: auto !important;
    max-height: none !important;
    overflow: hidden !important;
  }

  .document-viewer {
    flex: 1 1 auto;
    min-height: 0;
    border: 0;
    border-radius: 0;
  }
}
</style>
