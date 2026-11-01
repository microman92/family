# Family Space

Перед работой прочитай `README.md`, `PRD.md`, `SPEC.md` и `TASKS.md`. Продуктовые требования определяет PRD, технические решения — SPEC, порядок реализации — TASKS. `Documentation.html` — HTML-копия PRD/SPEC/TASKS; при изменении этих документов обновляй соответствующие фрагменты HTML.

После каждой завершённой задачи обновляй `TASKS.md`: отмечай проверенные пункты и фиксируй оставшиеся ограничения. Не отмечай этап завершённым, пока его обязательные проверки не пройдены.

## Стилизация

- Основная стилизация приложения — SCSS Modules (`*.module.scss`), файлы рядом с компонентами в соответствующем FSD-слайсе.
- Макеты страниц, виджеты, бизнес-компоненты, адаптивность и их состояния оформляй через SCSS Modules.
- Компоненты shadcn/ui сохраняй на Tailwind CSS, включая их варианты и состояния. Не переписывай их стили на SCSS.
- Глобальные стили ограничивай reset, базовой типографикой, подключением Tailwind и общими CSS-переменными темы. Используй единые токены для SCSS Modules и shadcn/ui.
- Не задавай одно свойство одного элемента одновременно через SCSS Module и Tailwind. Детали — `SPEC.md`, раздел 10.

## Taste

Для изменений интерфейса используй локальный навык [design-taste-frontend](.agents/skills/design-taste-frontend/SKILL.md) (taste). Это адаптация его принципов к семейному приложению: аудит перед изменениями, единые токены, читаемая типографика, понятная иерархия, контраст, мобильные и клавиатурные состояния. Маркетинговые требования к фотографиям и анимациям не переносить на рабочие экраны приложения.

Правила SCSS Modules/shadcn из этого файла имеют приоритет над Tailwind-default навыка. Текущий акцент по выбору пользователя — бургунди; светлая и тёмная темы используют общие семантические токены. Обоснование и результаты проверки — `docs/taste-audit.md`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
