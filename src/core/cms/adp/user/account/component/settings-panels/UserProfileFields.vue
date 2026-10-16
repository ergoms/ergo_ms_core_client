<script setup>
import { computed } from 'vue'
import DatePicker from '@/components/DatePicker.vue'
import FormField from '@/components/FormField.vue'
import { BIO_MAX_LENGTH } from '@/core/cms/adp/js/userProfileForm.js'
import { useAppI18n } from '@/i18n/useAppI18n.js'
import { toISODate } from '@/js/utils/timeUtils.js'

const BIRTH_DATE_MIN = '1900-01-01'

const formData = defineModel('formData', { type: Object, required: true })

const props = defineProps({
  fields: { type: Array, required: true },
  errors: { type: Object, default: () => ({}) },
  idPrefix: { type: String, default: 'user-profile' },
  emailReadonly: { type: Boolean, default: false },
  readonlyFields: { type: Array, default: () => [] },
})

const { t } = useAppI18n()
const bioCharCount = computed(() => (formData.value.bio || '').length)

const fieldMeta = computed(() => ({
  email: {
    label: t('settings.profile.email'),
    type: 'email',
    autocomplete: 'email',
    placeholder: 'email@example.com',
  },
  first_name: {
    label: t('settings.profile.firstName'),
    type: 'text',
    autocomplete: 'given-name',
    placeholder: t('settings.profile.enterFirstName'),
  },
  last_name: {
    label: t('settings.profile.lastName'),
    type: 'text',
    autocomplete: 'family-name',
    placeholder: t('settings.profile.enterLastName'),
  },
  middle_name: {
    label: t('settings.profile.middleName'),
    type: 'text',
    autocomplete: 'additional-name',
    placeholder: t('settings.profile.enterMiddleName'),
  },
  phone: {
    label: t('settings.profile.phone'),
    type: 'tel',
    autocomplete: 'tel',
    placeholder: '+7 (999) 123-45-67',
  },
  birth_date: {
    label: t('settings.profile.birthDate'),
    type: 'date',
    minDate: BIRTH_DATE_MIN,
    maxDate: toISODate(new Date()),
    inputFormat: 'dd MMMM yyyy',
    editFormat: 'dd.MM.yyyy',
  },
  bio: {
    label: t('settings.profile.bio'),
    type: 'textarea',
    placeholder: t('settings.profile.enterBio'),
  },
}))

const visibleFields = computed(() =>
  props.fields
    .filter((field) => fieldMeta.value[field])
    .map((field) => ({ key: field, ...fieldMeta.value[field] })),
)

const inputId = (field) => `${props.idPrefix}-${field}`

const isFieldReadonly = (fieldKey) =>
  (fieldKey === 'email' && props.emailReadonly) || props.readonlyFields.includes(fieldKey)
</script>

<template>
  <FormField v-for="(field, index) in visibleFields" :key="field.key" :label="field.label" :label-for="inputId(field.key)" :error="errors[field.key] || ''" :last="index === visibleFields.length - 1">
    <span v-if="isFieldReadonly(field.key)" class="form-field-static text-truncate" :title="formData[field.key] || t('settings.profile.notSpecified')">
      {{ formData[field.key] || t('settings.profile.notSpecified') }}
    </span>
    <DatePicker v-else-if="field.type === 'date'" :id="inputId(field.key)" v-model="formData[field.key]" :min-date="field.minDate || null" :max-date="field.maxDate || null" :input-format="field.inputFormat || ''" :edit-format="field.editFormat || ''" :invalid="Boolean(errors[field.key])"/>
    <textarea v-else-if="field.type === 'textarea'" :id="inputId(field.key)" v-model="formData[field.key]" rows="4" :maxlength="BIO_MAX_LENGTH" class="form-control form-control-sm" :class="{ 'is-invalid': errors[field.key] }" :placeholder="field.placeholder"/>
    <input v-else :id="inputId(field.key)" v-model="formData[field.key]" :type="field.type" class="form-control form-control-sm" :class="{ 'is-invalid': errors[field.key] }" :autocomplete="field.autocomplete" :placeholder="field.placeholder"/>
    <div v-if="field.key === 'bio' && !isFieldReadonly(field.key)" class="form-field-counter" :class="{ 'form-field-counter--limit': bioCharCount >= BIO_MAX_LENGTH }">
      {{ bioCharCount }}/{{ BIO_MAX_LENGTH }}
    </div>
  </FormField>
</template>

<style scoped lang="scss">
.form-field-static {
  display: block;
  padding-top: 0.35rem;
  font-size: 0.9375rem;
  color: var(--color-primary-text);
  text-align: left;
}

.form-field-counter {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: var(--color-secondary-text);
  text-align: right;
}

.form-field-counter--limit {
  color: var(--bs-danger, #dc3545);
}
</style>
