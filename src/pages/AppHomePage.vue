<script setup>
import { computed } from 'vue'
import { Bot, Boxes, Cloud, FlaskConical, GitBranch, Layers, ServerCog, ShieldCheck } from '@lucide/vue'

import SiteWordmark from '@/components/SiteWordmark.vue'
import { useUserStore } from '@/core/cms/js/userStore.js'
import { useAppI18n } from '@/i18n/useAppI18n.js'
import { formatWeekdayDate, systemParts } from '@/js/utils/timeUtils.js'

const { t } = useAppI18n()
const userStore = useUserStore()

const greeting = computed(() => {
  const hour = systemParts(new Date()).hour
  if (hour < 12) {
    return t('settings.home.goodMorning')
  }
  if (hour < 18) {
    return t('settings.home.goodAfternoon')
  }
  return t('settings.home.goodEvening')
})

const userLabel = computed(() => userStore.greetingName)

const formattedDate = computed(() => formatWeekdayDate(new Date()))

const highlights = computed(() => [
  {
    icon: Layers,
    title: t('settings.home.h1Title'),
    text: t('settings.home.h1Text'),
  },
  {
    icon: Boxes,
    title: t('settings.home.h2Title'),
    text: t('settings.home.h2Text'),
  },
  {
    icon: ServerCog,
    title: t('settings.home.h7Title'),
    text: t('settings.home.h7Text'),
  },
  {
    icon: ShieldCheck,
    title: t('settings.home.h8Title'),
    text: t('settings.home.h8Text'),
  },
  {
    icon: Bot,
    title: t('settings.home.h3Title'),
    text: t('settings.home.h3Text'),
    inProgress: true,
  },
  {
    icon: FlaskConical,
    title: t('settings.home.h4Title'),
    text: t('settings.home.h4Text'),
    inProgress: true,
  },
  {
    icon: Cloud,
    title: t('settings.home.h5Title'),
    text: t('settings.home.h5Text'),
    inProgress: true,
  },
  {
    icon: GitBranch,
    title: t('settings.home.h6Title'),
    text: t('settings.home.h6Text'),
    inProgress: true,
  },
])

</script>

<template>
  <div class="app-shell">
    <div class="app-shell__content">
      <header class="app-shell__hero app-shell__hero--centered">
        <div class="app-shell__brand app-shell__brand--centered">
          <p class="app-shell__eyebrow app-shell__eyebrow--date">{{ formattedDate }}</p>
          <h1 class="app-shell__title">
            <span class="visually-hidden">ERGO MS</span>
            <SiteWordmark class="site-wordmark--hero site-wordmark--centered" aria-hidden="true" />
          </h1>
          <p class="app-shell__subtitle">
            {{ greeting }}, <span class="app-home__username">{{ userLabel }}</span>!
          </p>
        </div>
      </header>

      <section class="app-shell__card" :aria-label="t('settings.home.aboutAria')">
        <h2 class="app-shell__card-title">{{ t('settings.home.aboutTitle') }}</h2>
        <p class="app-shell__card-text">
          {{ t('settings.home.aboutText') }}
        </p>
        <p class="app-shell__card-text app-shell__card-text--muted">
          {{ t('settings.home.aboutMuted') }}
        </p>
      </section>

      <section class="app-home__highlights" :aria-label="t('settings.home.highlightsAria')">
        <ul class="app-home__highlights-list">
          <li v-for="(item, index) in highlights" :key="item.title" class="app-home__highlight" :style="{ '--item-delay': `${index * 80}ms` }">
            <span class="app-home__highlight-icon" aria-hidden="true">
              <component :is="item.icon" :size="20" />
            </span>
            <div>
              <div class="app-home__highlight-heading">
                <h3 class="app-home__highlight-title">{{ item.title }}</h3>
                <span v-if="item.inProgress" class="app-home__highlight-badge">{{ t('settings.home.inProgress') }}</span>
              </div>
              <p class="app-home__highlight-text">{{ item.text }}</p>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
@import '@/scss/_app-shell-page.scss';

:deep(.site-wordmark--hero) {
  font-size: clamp(1.75rem, 3.2vw, 2.5rem);
}

.app-home__username {
  color: var(--color-primary-text);
  font-weight: 600;
}

.app-home__highlights {
  animation: app-shell-fade-up 0.8s ease 0.18s both;
  @include ui-reduced-motion;
}

.app-home__highlights-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.app-home__highlight {
  display: flex;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 1rem;
  background: color-mix(in srgb, var(--color-secondary-background) 55%, var(--color-primary-background));
  animation: app-shell-fade-up 0.55s ease var(--item-delay, 0ms) both;
  @include ui-reduced-motion;
}

.app-home__highlight-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.7rem;
  color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 12%, var(--color-primary-background));
}

.app-home__highlight-title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-primary-text);
}

.app-home__highlight-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.25rem;
}

.app-home__highlight-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 14%, var(--color-primary-background));
  border: 1px solid color-mix(in srgb, var(--color-accent) 28%, var(--color-border));
}

.app-home__highlight-text {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--color-secondary-text);
}

@media (width < $ui-bp-md) {
  .app-home__highlights-list {
    grid-template-columns: 1fr;
  }
}
</style>

