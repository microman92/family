# Фаза 1 — каркас и дизайн-система

Цель: создать локальный Next.js App Router каркас с FSD, SCSS Modules, shadcn/ui на Tailwind, темами, адаптивной навигацией и настоящими проверками качества.

Дата: 27.10.2026. Технический Gate 1: **PASS**. Выполнены T-001–T-011; фаза 2 не начата.

После первого прогона пользователь запросил taste и палитру бургунди. Навык установлен локально, оформление обновлено и повторно проверено; актуальные результаты находятся в [taste-audit.md](taste-audit.md). Ниже сохранены результаты первоначального каркаса.

## Что реализовано

- Next.js 16.4.3, React 19.3.1, TypeScript 6 strict, точные версии и package-lock; запуск без секретов.
- Корневой App Router и FSD; страницы используют публичные API слайсов, серверный вход защищён `server-only`. Структура будущих доменных модулей подготовлена без фиктивной бизнес-логики.
- Все маршруты PRD: главная, покупки, финансовые разделы, аналитика, календарь, задачи, заметки, уведомления, семья, настройки; каркас login/register/reset/onboarding/invite.
- Адаптивные sidebar/bottom navigation, сворачивание меню, меню пользователя, пустые/загрузочные/ошибочные состояния и 404. Кнопки неподключённого входа отключены.
- SCSS Modules для макетов и основных компонентов, shadcn/ui primitives на Tailwind v4, общие токены и light/dark/system с сохранением настройки.
- Zod, React Hook Form/resolver, валидаторы названия и положительной UZS-суммы, форматирование BigInt без потери точности, timezone-aware и date-only форматирование дат.
- ESLint/Prettier, dependency-cruiser, Vitest, Playwright, axe, GitHub Actions, env-пример, ADR и commit/PR правила.

## Реальные проверки

Окружение: Windows, Node.js 24.20.0, npm 11.19.0, установленный Google Chrome. Последний E2E-прогон выполнен с разрешением управления дочерними процессами и завершился кодом 0.

| Команда                    | Результат                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm.cmd ci`               | PASS, чистая установка 476 пакетов по lockfile, audit: 0 уязвимостей                           |
| `npm.cmd run format:check` | PASS                                                                                           |
| `npm.cmd run lint`         | PASS, ESLint без предупреждений; 84 модуля / 136 связей, нарушений архитектуры нет             |
| `npm.cmd run typecheck`    | PASS, Next route types + TypeScript                                                            |
| `npm.cmd test`             | PASS, 10 тестов                                                                                |
| `npm.cmd run build`        | PASS, 23 маршрута в выводе Next, включая служебные; статические страницы и динамический invite |
| `npm.cmd run test:e2e`     | PASS, 12 тестов, 31.4 секунды                                                                  |

E2E проверяет каждый предусмотренный маршрут, редирект с корня, 404, темы и их сохранение, реакцию system на изменение цветовой схемы устройства, desktop/mobile навигацию, сворачивание sidebar, клавиатуру и меню. Проверены ширины 320/375/768/1440; axe на главной, настройках, финансах и входе в обеих темах — без нарушений проверяемых правил WCAG A/AA. Скриншоты desktop/mobile и тёмных настроек просмотрены.

Отдельная отрицательная проверка архитектуры: временный feature импортировал страницу верхнего слоя и другой feature напрямую. `architecture` вернул код 1 и оба ожидаемых нарушения; временный файл удалён, финальная проверка проходит.

## Основные новые и изменённые файлы

- Корень: `package.json`, `package-lock.json`, `tsconfig.json`, `next-env.d.ts`, `next.config.ts`, `postcss.config.mjs`, `components.json`, `eslint.config.mjs`, `.dependency-cruiser.cjs`, конфигурации Vitest/Playwright/Prettier, `.env.example`, `.gitignore`, `.gitattributes`.
- `app/`: root layout, root redirect, icon, error/404; группы `(app)` и `(auth)` с маршрутами PRD, layout/loading/error приложения.
- `src/_app/`: providers, server public entry, global tokens/reset и отдельный Tailwind CSS.
- `src/_pages/{dashboard,section,settings,access,feedback}/`: страницы, состояния и SCSS Modules.
- `src/widgets/app-shell/`, `src/features/theme-switcher/`: навигация, меню и оформление.
- `src/shared/{config,ui,lib}/`: конфигурация разделов, UI primitives, форматирование, формы и валидация.
- `src/server/config/` и пустая структура auth/db/jobs/storage/modules, `entities/`, `supabase/`, интеграционные тесты и public icons.
- `tests/unit/format.test.ts`, `tests/e2e/shell.spec.ts`, `.github/workflows/ci.yml`, `.github/pull_request_template.md`.
- `docs/design.md`, `docs/adr/001-phase-one-foundation.md`, этот отчёт, `scripts/sync-documentation.py`, README/SPEC/TASKS/CHANGELOG и HTML-копия документации.

## Ограничения

- GitHub Actions workflow настроен; удалённый прогон не выполнялся, удалённого репозитория пока нет. Локальные команды проходят.
- ESLint 9.39.5 имеет предупреждение npm об окончании поддержки. Это совместимая ветка для плагинов текущего Next.js; ESLint 10 создаёт конфликт peer dependencies. Подробности — в ADR A-12.
- Авторизация, Supabase, Telegram-приглашения/уведомления и финансовые операции пока не подключены. В UI нет пользовательских данных, мутаций или фиктивных успешных входов.

Следующий этап по TASKS — фаза 2: Supabase Auth, Telegram OIDC и онбординг. Эта работа в текущую фазу не включалась.

Миграции/RLS: не применимы к первой фазе, пользовательских таблиц нет. Граница открытого каркаса и будущей авторизации описана в ADR A-12.
