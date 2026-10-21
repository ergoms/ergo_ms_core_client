# Клиент (Vue 3)

Клиент ERGO MS: маршруты, боковое меню, общие компоненты, стили. Сборка — Vite.

Запуск: `ergoms start-client` (порт `CLIENT_PORT`, по умолчанию **8001**). Зависимости npm — через `ergoms npm` ([`.cursor/rules/npm-workspace.mdc`](../../.cursor/rules/npm-workspace.mdc)). Подробности — [`.docs/development.md`](../../.docs/development.md), [`.docs/cli.md`](../../.docs/cli.md). Оглавление документации — в [корневом README](../../README.md#документация).

## Структура

| Каталог | Назначение |
|---------|------------|
| `src/components/` | общие компоненты ядра (`SelectBox`, `SearchInput`, `DropDown`, `UserAvatar`, …) |
| `src/components/menu/` | боковое меню (`MenuList`, `MenuGroup`, composables) |
| `src/core/` | CMS, админка, авторизация, профиль, audit, notifications |
| `src/modules/` | discovery маршрутов, тем, i18n и прав (`ModuleLoader`) |
| `src/integrations/` | ModuleBridge, контракты, layout plugins, session-scope |
| `src/i18n/` | каталоги локализации клиента |
| `src/js/` | клиент API, `clientEnv`, session, toast, confirm, WebSocket, realtime, media |
| `src/shell/` | оболочка приложения (layout, шапка) |
| `src/scss/` | стили ядра |
| `scripts/` | сборка и сервер разработки |

Маршруты модулей подхватываются из `modules/*/client/js/routes.js`. Боковое меню приходит из API (данные в БД после миграций сервера) — см. [`.docs/architecture.md`](../../.docs/architecture.md#боковое-меню).

## Правила для разработчиков

| Тема | Правило |
|------|---------|
| Компоненты UI | [`.cursor/rules/components.mdc`](../../.cursor/rules/components.mdc) |
| Стиль Vue, toast, confirm | [`.cursor/rules/client_code.mdc`](../../.cursor/rules/client_code.mdc) |
| Модули, мост | [`.cursor/rules/modules.mdc`](../../.cursor/rules/modules.mdc) |
| Route guards | [`.cursor/rules/route-guards.mdc`](../../.cursor/rules/route-guards.mdc) |
| i18n | [`.cursor/rules/i18n.mdc`](../../.cursor/rules/i18n.mdc) |
| Ошибки в логах | [`.cursor/rules/log-error.mdc`](../../.cursor/rules/log-error.mdc) |
| Права маршрутов (UX) | [`.cursor/rules/permission_rules.mdc`](../../.cursor/rules/permission_rules.mdc) |
| npm workspace | [`.cursor/rules/npm-workspace.mdc`](../../.cursor/rules/npm-workspace.mdc) |
| Файлы (media_api) | [`.cursor/rules/media_api.mdc`](../../.cursor/rules/media_api.mdc) |
| Боковое меню | [`.cursor/rules/menu.mdc`](../../.cursor/rules/menu.mdc) |
| Realtime / WebSocket | [`.cursor/rules/realtime.mdc`](../../.cursor/rules/realtime.mdc) |
| Redis, nginx (prod) | [`.cursor/rules/deployment-infra.mdc`](../../.cursor/rules/deployment-infra.mdc) |
| Клиент за nginx, пустой экран | [`.cursor/rules/nginx-spa-boot.mdc`](../../.cursor/rules/nginx-spa-boot.mdc) |
| Темы и шрифты | [`.cursor/rules/themes.mdc`](../../.cursor/rules/themes.mdc) |
| Безопасность (public_id, токены) | [`.cursor/rules/security.mdc`](../../.cursor/rules/security.mdc) |

## Связанные части ядра

- Сервер: [`../api/README.md`](../api/README.md)
- Файлы: [`../media_api/README.md`](../media_api/README.md)
- Развёртывание: [`../deployment/logic.md`](../deployment/logic.md)
