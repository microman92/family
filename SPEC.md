# Family Space — Software Specification (SPEC)

> **Версия:** 2.0 · **Дата:** 26.10.2026 · **Цель:** техническая реализация полного V1 из [PRD.md](PRD.md) **без ИИ**.  
> Этот документ определяет правила архитектуры, безопасности и финансовых расчётов. Пошаговое исполнение — [TASKS.md](TASKS.md).

## 1. Стек и технические ограничения

| Компонент | Решение |
|---|---|
| Fullstack | Next.js App Router + TypeScript (`strict: true`) |
| UI | React, SCSS Modules (Sass) для основной стилизации; shadcn/ui на Tailwind CSS; Lucide, React Hook Form + Zod |
| Графики | Recharts или эквивалент с доступной таблицей значений |
| Auth | Supabase Auth: Telegram через custom OIDC provider; email/password дополнительно; отдельная учётная запись каждого участника |
| Data | Supabase PostgreSQL + SQL-миграции + RLS |
| Realtime | Supabase Realtime для безопасных семейных обновлений; подписки фильтровать по доступу |
| Файлы | Private Supabase Storage + signed URLs после авторизации |
| Время/расписания | UTC в БД, IANA timezone (`Asia/Tashkent` по умолчанию), библиотека RRULE + scheduler/Cron |
| Notifications | In-app outbox; Telegram Bot API в привязанный аккаунт при разрешении; Web Push при разрешении, Service Worker для PWA |
| Форматы | UZS, целые сумы (`bigint` в БД, строковое/целочисленное точное представление в JSON/TS без потери точности) |
| Тесты | Vitest (unit), PostgreSQL + Supabase local (integration/RLS), Playwright (E2E), axe |
| Качество | ESLint + архитектурные границы, Prettier, typecheck, CI, миграции |
| Deploy | Vercel + Supabase (возможно иной совместимый хостинг) |
| Язык UI | Русский; контракты/код — английские идентификаторы |

**Версии библиотек зафиксировать при старте проекта по совместимой стабильной ветке; не писать в документации не проверенные номера.** Для SSR с cookie session используется `@supabase/ssr` (проверить release notes при установке). Секретные ключи только на сервере, publishable key может быть клиентским.

**Не использовать в V1:** LLM, OCR/AI API, внешние банковские API, реальную обработку платежей, «магические» фиктивные сервисы вместо БД.

## 2. Структура: FSD для UI, Clean Architecture для сервера

### 2.1 Почему гибрид

**FSD** стандартизирует организацию интерфейса: бизнес-сущности, пользовательские действия, виджеты, страницы, общие компоненты. **Серверный домен** содержит сложную финансовую логику и не должен зависеть от React-компонентов. Поэтому модульный серверный слой строится отдельно: `domain / application / infrastructure`. Это предотвращает смешивание UI, SQL и расчётов.

**Особенность Next.js:** его служебные папки `app`/`pages` конфликтуют с FSD. Создать маршруты в корневой `/app`, а FSD-слои назвать `src/_app` и `src/_pages`. **Не создавать `src/app` и `src/pages` с компонентами FSD.**

```text
family-space/
├── app/                        # Только Next.js App Router, layouts, route adapters
│   ├── (auth)/login/page.tsx
│   ├── (auth)/register/page.tsx
│   ├── (app)/dashboard/page.tsx
│   ├── (app)/shopping/page.tsx
│   ├── (app)/finance/page.tsx
│   ├── (app)/finance/transactions/page.tsx
│   ├── (app)/finance/budgets/page.tsx
│   ├── (app)/finance/debts/page.tsx
│   ├── (app)/finance/goals/page.tsx
│   ├── (app)/finance/recurring/page.tsx
│   ├── (app)/analytics/page.tsx
│   ├── (app)/calendar/page.tsx
│   ├── (app)/tasks/page.tsx
│   ├── (app)/notes/page.tsx
│   ├── (app)/notifications/page.tsx
│   ├── (app)/family/page.tsx
│   ├── (app)/settings/page.tsx
│   └── api/v1/.../route.ts       # Тонкие маршруты, авторизация, DTO
├── src/
│   ├── _app/                   # FSD app: providers, root composition, theme
│   ├── _pages/                 # FSD pages: dashboard, shopping, finance, etc.
│   │   ├── dashboard/{ui,index.ts}
│   │   └── finance/{ui,index.ts,index.server.ts}
│   ├── widgets/                # dashboard-summary, finance-overview, navigation
│   ├── features/               # create-purchase, post-transaction, add-goal, ...
│   │   ├── create-purchase/{ui,model,api,index.ts}
│   │   └── complete-task/{ui,model,api,index.ts}
│   ├── entities/               # family, shopping-item, finance-transaction, task
│   │   └── finance-transaction/{ui,model,api,index.ts}
│   ├── shared/                 # ui, lib, config, types, api(client-only contracts)
│   └── server/                 # Только серверный код. Не является FSD-слоем.
│       ├── auth/               # getCurrentUser, authorize, session
│       ├── db/                 # Supabase server clients, repositories, migrations APIs
│       ├── modules/
│       │   ├── family/{domain,application,infrastructure}
│       │   ├── shopping/{domain,application,infrastructure}
│       │   ├── ledger/{domain,application,infrastructure}
│       │   ├── budgets/{domain,application,infrastructure}
│       │   ├── debts/{domain,application,infrastructure}
│       │   ├── goals/{domain,application,infrastructure}
│       │   ├── recurring/{domain,application,infrastructure}
│       │   ├── calendar/{domain,application,infrastructure}
│       │   ├── tasks/{domain,application,infrastructure}
│       │   ├── notes/{domain,application,infrastructure}
│       │   └── notifications/{domain,application,infrastructure}
│       ├── jobs/               # scheduler, reminders, occurrence generation
│       └── storage/            # signed URLs, upload guards
├── supabase/migrations/        # Источник схемы: версионированный SQL
├── supabase/tests/             # SQL/RLS integration tests
├── tests/{unit,integration,e2e}/
├── public/{icons,manifest.webmanifest}
├── docs/{adr,flows}/
└── .github/workflows/
```

### 2.2 Правила FSD и границ

- Направление зависимостей FSD: `_pages → widgets → features → entities → shared`. Можно пропускать слои. **Слайсы одного слоя не импортируют друг друга напрямую.** Для необходимых связей — контракт/композиция в вышестоящем слое или задокументированное исключение `@x`.
- `shared` **не содержит** бизнес-правил «семейного бюджета»; лишь UI primitives, общее форматирование, generic utilities.
- В каждом слайсе публичный `index.ts`; запрет deep imports между слайсами. Серверный RSC-export — `index.server.ts`; запрет импорта server-only кода из Client Components.
- Server `application` зависит от контрактов/портов (`repositories`, `clock`, `notification dispatcher`), `infrastructure` реализует их. `domain` не зависит от Next.js, React и Supabase SDK.
- Next.js `page.tsx` — тонкий адаптер: получает разрешённые DTO, рендерит FSD-страницу; `route.ts`/Server Actions — **всегда** проверяют пользователя, полномочия, данные и вызывают application use case.
- Не создавать giant `utils.ts`, общий глобальный Zustand-store для всех денег или god-service.

### 2.3 SOLID — обязательные правила с примерами

| Принцип | Реализация / пример | Антипаттерн |
|---|---|---|
| **S** — Single Responsibility | `PostExpenseUseCase` проверяет и проводит расход; `ExpenseRepository` сохраняет; `ExpenseChart` рисует | Компонент одновременно пишет SQL, строит диаграмму и вычисляет сумму |
| **O** — Open/Closed | Новые типы напоминаний через стратегию/handler registry и валидируемые контракты | Сотни `if` внутри общего компонента |
| **L** — Liskov | `FinanceRepository` одинаково соблюдает семантику для in-memory test и Supabase реализации | Подмена репозитория меняет финансовые инварианты |
| **I** — Interface Segregation | `LedgerReader`, `LedgerWriter`, `Clock`, `NotificationSender` по назначению | Один интерфейс `AppService` с десятками методов |
| **D** — Dependency Inversion | Сценарий `PayRecurringBill` зависит от `LedgerPort`, не от клиента Supabase | Use case создаёт `new SupabaseClient()` |

**DRY:** единые правила форматирования UZS, прав доступа, повторов, пересчётов, нормализации дат, валидаторы контрактов. Не абстрагировать две внешне похожие операции, если у них различается бизнес-смысл; «сделать одинаково» не важнее безопасности и явности.

**Контроль в CI:** lint rules на forbidden imports/deep imports, анализ циклов зависимостей (`dependency-cruiser`/подобное), coverage critical domain, PR checklist «SOLID/DRY/FSD».

## 3. Авторизация, роли и изоляция данных

### 3.1 Регистрация и онбординг

1. Supabase Auth: основной Telegram-вход через custom OIDC provider (`custom:telegram`, issuer `https://oauth.telegram.org`, `email_optional=true`), email/password дополнительно. Проверять подпись, issuer/audience/expiry/nonce и OAuth state/PKCE; выдавать настоящую Supabase session для `auth.uid()`/RLS. Совместимость версии Supabase Auth и отсутствие отдельного Telegram UserInfo endpoint проверить в фазе 2. Не создавать фиктивный email или самодельную сессию. Подтверждение почты/reset password применяются только к email/password.
2. Создание профиля `profiles` по `auth.users.id`; создание семьи и первого `admin` в транзакции.
3. Инвайт: криптостойкий непрозрачный токен → хранить **только hash**, TTL, одноразовость, revoked/accepted state и роль. Ссылка `https://t.me/<bot>?start=invite_<token>` и QR содержат один код; start-параметр не длиннее 64 допустимых символов. Webhook проверяет секрет Telegram, обрабатывает update идемпотентно и создаёт короткоживущий одноразовый handoff, привязанный к отправителю. В браузере после OIDC сравнить подтверждённый Telegram user ID с получателем handoff; показать семью/роль и атомарно принять инвайт после подтверждения. Сам `/start` не создаёт членство или веб-сессию; инвайт расходуется только при успешном вступлении.
4. Присоединение к семье идемпотентно. `family_members` хранит роль, статус `active/invited/removed`; V1 unique active user-to-family.
5. `child` — отдельный логин или неаутентифицируемый исполнитель `member_profiles`; не выдавать пароль ребёнка взрослым через интерфейс.
6. Удаление участника отзывает членство, проверяется во всех разрешениях без reliance на устаревшие клиентские claims.

### 3.1.1 Привязка Telegram и доставка

- Отдельная закрытая таблица `telegram_connections(user_id, issuer, subject, telegram_user_id, private_chat_id, messages_enabled, linked_at, disabled_at)` связывает проверенную OIDC identity с пользователем Supabase и личным чатом бота. `subject` и Telegram user ID не считать взаимозаменяемыми; ID чата получать из проверенного private-chat update и сверять отправителя с подтверждённым Telegram ID.
- Уникальность identity и Telegram user ID не позволяет привязать один Telegram к разным пользователям. Не доверять username, client metadata или присланному из браузера chat ID; привязка существующего аккаунта требует действующей сессии и повторного подтверждения Telegram. Отвязка отменяет будущую Telegram-доставку; смена аккаунта не переносит личные сообщения автоматически.
- Для OIDC запрашивать `openid profile`, разрешение `telegram:bot_access` — по согласию; также поддержать явный запуск бота. Бот не пишет произвольным username. Bot token, OIDC client secret и webhook secret — только серверные секреты, без логирования приглашений/токенов.
- Серверный dispatcher использует тот же outbox, что in-app/push, проверяет доступ и актуальную привязку перед отправкой. Кнопки ведут на разрешённую страницу Family; переход снова требует авторизации. При блокировке бота отключать канал, при временных ошибках учитывать retry_after/backoff. При неясном результате отправки не обещать exactly-once: внутренний dedupe защищает от повторных jobs, но Bot API не даёт атомарной транзакции с нашей БД.

### 3.2 Политика доступа

Пользовательские записи в БД используют один из **двух** контекстов:

- `visibility='family'`: `family_id NOT NULL`, `owner_user_id NULL`. Доступ зависит от **активного членства** и permissions на тип записи/действие.
- `visibility='private'`: `family_id NULL`, `owner_user_id NOT NULL`. Доступ имеет только владелец; даже после выхода из семьи записи остаются его личными. Админ семьи не может их видеть.

Для каждой пользовательской таблицы в миграции **CHECK** на корректную пару полей, RLS `SELECT/INSERT/UPDATE/DELETE` и индексы `family_id`, `owner_user_id`. Исключения (например, global presets, junction/ledger postings) имеют отдельно описанное наследование scope родителя через безопасный серверный доступ и FK/триггеры.

Действия с семейными финансами: `admin`/`member`; `child` — отказ по умолчанию. При желании позднее расширять права как granular capabilities, но **не** делая `child` финансовым администратором через фронтенд.

| Операция | admin | member | child | Чужая private запись |
|---|---|---|---|---|
| Family shopping/tasks/notes/calendar | CRUD | CRUD | ограниченные разрешённые действия | Нет |
| Family accounts/transactions/budgets/debts/goals | CRUD | CRUD | Нет по умолчанию | Нет |
| Family invitations/settings | Да | Просмотр участников | Нет | Н/Д |
| Собственные private финансы, задачи, заметки | Да | Да | Собственные разрешённые модули | Нет |
| Экспорт данных семьи | Да | По праву finance | Нет | Нет |

**Реализация RLS:** использовать `auth.uid()` и отдельную безопасную SQL-функцию получения membership/role в непубличной схеме (`SECURITY DEFINER`, фиксированный `search_path`, минимальные права), чтобы избежать рекурсивных policy. Запрет anon grants на приватные таблицы. Никаких service-role ключей/обхода RLS в браузере. Обязательно тестировать `WITH CHECK` на `INSERT`/`UPDATE` (запрет смены владельца/семьи). Realtime, Storage, exports, materialized views и отчёты повторяют тот же access scope.

### 3.3 Правила ссылок между сущностями

- Чужую private запись нельзя привязать к общей задаче/событию или вывести её название в общих уведомлениях.
- `shopping → ledger expense` и `recurring → ledger expense` требуют **одинаковой visibility и владельца/семьи**.
- Нельзя выбирать личный счёт для семейной покупки/общей операции; пользователь явно выбирает общий счёт или переводит действие в личное.
- `assigned_to` / `participants` для семейных задач ссылаются на активных членов **той же семьи**.
- SQL FK недостаточен для same-scope ссылок: внедрить trigger/check в transaction boundary и integration tests.
- Экспорт, поисковый индекс, dashboard, activity feed, push должны быть сформированы после проверки авторизации.

## 4. Финансовая модель: единый журнал и двойная запись

### 4.1 Инварианты

1. Учётные суммы — integer UZS (`bigint`), API сериализует потенциальные `bigint` как десятичные строки и валидирует диапазон.
2. **Баланс — производная журнала, а не произвольно редактируемое поле**: `SUM(postings)` плюс контроль за знаками по типу счёта.
3. Каждая проведённая финансовая операция содержит **минимум два postings**, алгебраическая сумма `amount_signed = 0`.
4. Внутри операции все accounts имеют один `scope`, одну семью или одного владельца и одну валюту.
5. Транзакция atomic: ledger header + postings + source link + audit + outbox фиксируются вместе либо всё откатывается.
6. `request_id` / idempotency key гарантирует, что двойной клик/ретрай не создаёт две операции.
7. Проведённые postings не обновляются/не удаляются. Ошибки → reverse journal + новый корректный факт; источник помечается исправленным. Система сохраняет автора, причину и дату.
8. **Категория расхода** определяется posted расходом по ledger, а не planned shopping/recurring/goal.
9. Перемещение между денежными счетами, основная сумма полученного займа, возврат тела займа и перекладывание в цель **не учитываются как обычные доходы/расходы**. Комиссии и проценты — расходы.
10. Консистентность до отображения: для денежных операций нет «optimistic success» до подтверждения сервера; UI показывает pending + блокирует повторное действие на уровне request ID.

### 4.2 Счета и знаки (дебет +, кредит −)

`finance_accounts.kind = asset | liability | equity | income | expense`. Подтипы: `cash`, `bank_card`, `savings`, `receivable`, `payable`, `income_nominal`, `expense_nominal`. UI показывает реальные денежные (`asset`) и долговые счета, номинальные используются внутри журнала.

| Сценарий | Проводка (+ debit) | Проводка (− credit) | Попадает в аналитику дохода/расхода? |
|---|---|---|---|
| Зарплата 1 000 000 | Наличные +1 000 000 | Доходы −1 000 000 | Доход +1 000 000 |
| Продукты 30 000 | Расходы: продукты +30 000 | Наличные −30 000 | Расход +30 000 |
| Наличные → карта 100 000 | Карта +100 000 | Наличные −100 000 | **Нет** |
| Заём получен 500 000 | Наличные +500 000 | Долг к оплате −500 000 | **Нет** |
| Погашение тела займа 100 000 | Долг к оплате +100 000 | Наличные −100 000 | **Нет** |
| Проценты по займу 5 000 | Расходы: проценты +5 000 | Наличные −5 000 | Расход +5 000 |
| Займ выдан 100 000 | Дебиторская задолженность +100 000 | Наличные −100 000 | **Нет** |
| Возврат выданного займа 100 000 | Наличные +100 000 | Дебиторская задолженность −100 000 | **Нет** |
| Наличные → накопления 200 000 | Накопительный счёт +200 000 | Наличные −200 000 | **Нет** |

**Примечание:** баланс обязательства = `-SUM(postings)` по liability; балансы asset = `SUM(postings)`. Номинальные счета (income/expense) являются внутренними и используются для точного расчёта доходов/расходов. Начальные остатки создавать как отдельные проводки с системным balancing account (внутренний equity/opening), без включения в доходы периода.

### 4.3 Покупка в журнале

1. Пользователь подтверждает фактическое количество и полную цену; выбирает допустимый счёт и `occurred_at`.
2. `PostPurchaseUseCase` проверяет остаток планового количества (или явное разрешение перепокупки), права и идемпотентность.
3. Создать `purchase_events` с immutable fact; привязать к `finance_transactions` типа expense; сделать balanced postings; обновить projection статуса покупки; сохранить в одной SQL транзакции (RPC/хранимая функция с минимальными полномочиями и собственной авторизацией).
4. Если цена/количество исправляется — обратная операция и новое событие. Не «переписать суммы в старой строке».
5. Источник операции имеет уникальность `(source_type, source_id, source_event_id)`, чтобы аналитика не получила вторую ручную копию.
6. «Оплата позже»: вместо списания с денежного счёта создаётся долг/обязательство и расход с кредитом в payable. Позднейшее погашение уменьшает payable, не увеличивая расход ещё раз.
7. Аналитика покупок опирается на связанные posted ledger facts, с учётом сторно/возвратов.

### 4.4 Финансовая аналитика

- **Фактический доход/расход:** суммы записей по `income_nominal` / `expense_nominal` с учётом reverse и refund.
- **Cash flow:** операции по asset счетам с фильтрами направления и контекста; не смешивать с «результатом месяца».
- **Денежный остаток:** posted balance по разрешённым asset счетам.
- **Бюджет:** posted expenses по категории, в заданном периоде и scope; не включать планируемые обязательства.
- **Долг:** signed balance по связанному payable/receivable аккаунту; тело займа отдельно от процентов.
- **Цель:** баланс целевого asset savings account и связанного goal, не сумма заявленных пользователем пополнений.
- **Shopping plan-vs-actual:** planned из карточек покупок; actual из подтверждённых событий/журнала; не включать личное в семейное.
- Фильтр периода применяет семейную/персональную timezone к UTC-граням **до SQL агрегации**, а не после.

## 5. Модель данных PostgreSQL

### 5.1 Конвенции схемы

- Все сущности имеют `id uuid`, `created_at timestamptz`, `updated_at timestamptz` (где требуется), `version int` для оптимистической блокировки редактируемых записей.
- `visibility` = `family | private`; правило парного scope выше. `actor_user_id` — кто фактически записал событие.
- `is_demo boolean`, `archived_at/deleted_at` там, где допустимо. Финансовые postings не soft delete.
- Время UTC, деньги `bigint`, количество `numeric(14,3)` с положительными CHECK, отдельное значение `currency = 'UZS'`.
- Никаких server-секретов или токенов приглашений в открытой таблице.
- Для массивов документов использовать отдельные таблицы отношений, не безразмерные JSON-поля вместо нормализованной доменной модели.

### 5.2 Минимальный перечень таблиц (обязательный)

| Домен | Таблицы (основные поля; детальные миграции — в этапе реализации) |
|---|---|
| Auth / family | `profiles(user_id, display_name, avatar_path, locale, timezone)`; `families(id,name,timezone,currency,created_by)`; `family_members(id,family_id,user_id?,role,status,permissions)`; `member_profiles(family_id,display_name,linked_member_id?)`; `family_invites(family_id,token_hash,expires_at,uses_left,role,created_by)` |
| Общие категории | `shopping_categories(id,scope...,name,icon,color,archived_at)`; `finance_categories(id,scope...,type,income_or_expense,nominal_account_id)`; `tags` и join-таблицы при необходимости |
| Покупки | `shopping_items(id,scope...,title,category_id,planned_qty,unit,planned_unit_price,priority,big_purchase,location,due_at,status,assigned_to,version)`; `purchase_events(id,shopping_item_id,qty,actual_total,occurred_at,actor_user_id,financial_tx_id,correction_of_id?)` |
| Журнал | `finance_accounts(id,scope...,kind,subtype,name,currency,is_system,archived_at)`; `finance_transactions(id,scope...,type,category_id?,occurred_at,status,source_type,source_id,source_event_id,request_id,actor_user_id,description,reversed_by?)`; `ledger_postings(id,transaction_id,account_id,amount_signed)`; `financial_audit(id,transaction_id,action,actor_user_id,reason,created_at)` |
| Бюджеты | `budgets(id,scope...,month_key,category_id?,limit_amount,version)`; `budget_threshold_notifications(...)` для подавления повторов |
| Долги | `debts(id,scope...,direction,kind,counterparty_name,principal_amount,ledger_account_id,interest_mode,rate?,started_at,due_at,status)`; `debt_schedule(id,debt_id,due_at,principal_due,interest_due,fees_due,status)`; `debt_payment_allocations(id,schedule_id,financial_tx_id,principal_paid,interest_paid,fee_paid)` |
| Цели | `saving_goals(id,scope...,name,target_amount,target_date,savings_account_id,status)`; движения — только ledger tx с `source_type=goal` |
| Периодические платежи | `recurring_bills(id,scope...,title,expected_amount,finance_category_id,account_id?,rrule,timezone,start_at,reminder_rule,status)`; `bill_occurrences(id,bill_id,due_at,expected_amount,paid_amount,status,financial_tx_id?,idempotency_key)` |
| Календарь | `calendar_events(id,scope...,title,description,start_at,end_at,is_all_day,timezone,rrule?,location,created_by)`; `event_attendees(id,event_id,user_id,response)`; `event_links(id,event_id?,source_type,source_id)` — только если нужно физически связать |
| Задачи | `tasks(id,scope...,title,description,status,priority,due_at,rrule?,parent_template_id?,assigned_to?,version)`; `task_checklist_items(id,task_id,title,done,sort_order)`; `task_links(task_id,source_type,source_id)` |
| Заметки | `notes(id,scope...,title,body_markdown,pinned,archived_at,version)`; `note_tags`, `note_attachments(id,note_id,storage_path,mime,size,uploaded_by)` |
| Напоминания | `reminder_rules(id,scope...,source_type,source_id,timing_kind,relative_offset,local_time?,timezone,enabled,channel_enabled)`; `notifications(id,user_id,source_type,source_id,scheduled_at,title_safe,body_safe,status,read_at,dedupe_key)`; `push_subscriptions(id,user_id,endpoint_hash,encrypted_subscription,enabled)`; `notification_attempts(id,notification_id,channel,attempt,status)` |
| Общая инфраструктура | `activity_events(id,scope...,actor_user_id,object_type,object_id,event_type,summary_safe)`; `idempotency_requests(id,scope...,request_id,operation,result_hash)`; `file_uploads` при не-Note attachments; `job_runs` / `outbox_events` |

**Важное:** таблица — список **контрактов**, а не готовая миграция. Реализация обязана добавить FK, внешние ON DELETE-политики, CHECK, unique, RLS и транзакционные инварианты. Не менять скрытно доменные понятия при генерации кода.

### 5.3 Ограничения и индексы

- `family_members`: уникальное активное членство по `user_id` и уникальность `(family_id,user_id)` с учётом nullable profiles; не позволять удалять последнего admin.
- `ledger_postings`: индекс `(transaction_id)`, `(account_id)`; **отложенный триггер/контролируемая процедура** проверяет баланс суммы postings при завершении атомарной posting-операции.
- `finance_transactions`: unique `(scope_key, request_id)` и частичный unique `(source_type, source_event_id)` для posted-origin событий; запрет scope crossing.
- `recurring_bills`: index на активное следующее наступление; `bill_occurrences`: unique `(bill_id,due_at)`; задания расписания идемпотентны.
- `tasks`/`calendar_events`: `(family_id,due_at)` и `(owner_user_id,due_at)`; `notifications`: unique `(user_id,dedupe_key)`, index `(user_id,status,scheduled_at)`.
- `finance_accounts`: индексы по `(family_id,kind)` / `(owner_user_id,kind)`; `finance_transactions` — scope и `occurred_at`.
- `notes`: безопасный поиск с ограничением по owner/scope **до** возврата сниппетов.
- Каждая FK на связанную shared/private запись проверяет одинаковый scope (trigger/service invariant).

### 5.4 Что запрещено хранить как поле-истину

- `current_balance`, который клиент напрямую меняет.
- `total_spent` как редактируемую сумму вне единого ledger (можно materialized projection с проверкой/rebuild).
- `is_paid=true` для recurring template вместо отдельного оплаченного occurrence.
- `progress=700000` для цели без соответствующего финансового факта.
- Сериализованное личное содержимое в совместной activity ленте.

## 6. Серверные use cases и контракты

### 6.1 Главные application commands

```ts
interface CommandContext {
  actorUserId: string;      // только из проверенной сессии
  requestId: string;        // idempotency key для финансовых POST
}

type Scope =
  | { visibility: 'family'; familyId: string }
  | { visibility: 'private'; ownerUserId: string };

type MoneyUZS = string;    // decimal integer string; parse/validate in domain

type PostExpense = {
  scope: Scope;
  fromAccountId: string;
  categoryId: string;
  amountUZS: MoneyUZS;
  occurredAt: string;
  description?: string;
  source?: { type: 'manual' | 'shopping' | 'recurring'; id: string };
};

interface LedgerPostingPort {
  postExpense(command: PostExpense, ctx: CommandContext): Promise<{ transactionId: string }>;
  reverseTransaction(id: string, reason: string, ctx: CommandContext): Promise<{ reversalId: string }>;
}
```

Нельзя брать `actorUserId`, `role`, `familyId` как доказательство прав из JSON запроса. `Scope` в запросе — только желаемый объект работы, каждый раз сверяется с authenticated actor. Деньги читать строкой/BigInt безопасно; JSON numeric > safe integer запрещать.

### 6.2 API: примерные маршруты

| Метод | Маршрут | Операция |
|---|---|---|
| POST | `/api/v1/families` | Создать семью |
| POST | `/api/v1/families/invitations` | Инвайт (admin) |
| POST | `/api/v1/families/invitations/accept` | Вступить в семью |
| GET/POST/PATCH | `/api/v1/shopping` | Список, создание, изменение |
| POST | `/api/v1/shopping/:id/purchases` | Зафиксировать факт частичной/полной покупки |
| GET/POST | `/api/v1/finance/accounts` | Счета и начальный остаток через ledger |
| GET/POST | `/api/v1/finance/transactions` | Журнал; создать доход/расход/перевод |
| POST | `/api/v1/finance/transactions/:id/reverse` | Сторно |
| GET/PUT | `/api/v1/finance/budgets` | Бюджеты |
| GET/POST | `/api/v1/finance/debts` | Долговые договоры и график |
| POST | `/api/v1/finance/debts/:id/payments` | Зафиксировать взнос |
| GET/POST | `/api/v1/finance/goals` | Цели накоплений |
| POST | `/api/v1/finance/goals/:id/contributions` | Перевод на целевой счёт |
| GET/POST | `/api/v1/finance/recurring` | Шаблоны и occurrences |
| POST | `/api/v1/finance/recurring/:id/occurrences/:occurrenceId/pay` | Оплатить факт |
| GET | `/api/v1/analytics` | Сводка по запросу scope/period |
| GET/POST | `/api/v1/calendar/events` | События |
| GET/POST/PATCH | `/api/v1/tasks` | Задачи и повторения |
| GET/POST/PATCH | `/api/v1/notes` | Заметки |
| GET/PATCH | `/api/v1/notifications` | Уведомления/read |
| POST | `/api/v1/files/upload-intent` | Ограниченная загрузка вложения |
| GET | `/api/v1/export` | Разрешённый CSV/JSON экспорт |

Это **контракты BFF**, а не требование делать для каждого действия отдельный HTTP-запрос из браузера: допускаются Server Actions для форм при той же security-проверке. Каждый endpoint: auth, schema validation, check permissions, idempotency (write), domain use case, DTO. **Не возвращать строки другой семьи или чужого private.**

### 6.3 Единый контракт ошибок

```json
{
  "error": {
    "code": "ACCOUNT_SCOPE_MISMATCH",
    "message": "Этот счёт недоступен для выбранного пространства",
    "requestId": "8c3f…"
  }
}
```

`400` валидация; `401` отсутствует вход; `403` запрет; `404` неизвестный объект без раскрытия существования; `409` конфликт version / duplicate; `422` нарушение доменного инварианта; `429` rate limit; `500` непредвиденная ошибка. Логи содержат request ID, но не персональные секреты/текст личных заметок.

## 7. Бюджеты, долги, накопления и регулярность — алгоритмы

### 7.1 Месячные бюджеты

- `period_key = YYYY-MM` в timezone scope (для семьи — timezone семьи; private — пользователя).
- `actual_spent = SUM(expense nominal debits net of reversals/refunds)` для данного scope/category/периода.
- У общего лимита `category_id IS NULL`: сумма всех расходов, а не сумма бюджетных лимитов по категориям (не удваивать).
- Если расход относится к покупке, он уже содержится в ledger — не прибавлять его второй раз из `purchase_events`.
- Пересечение месяца или изменение часового пояса пересчитывать стабильно от конкретной даты операции; выбор даты влияет на включение в период и фиксируется историей.

### 7.2 Долговой договор

- `principal_amount` — исходная сумма; **текущий остаток** — баланс debt ledger account; график показывает предстоящие instalments отдельно.
- Для взноса: при фиксировании суммы сначала распределить явно `principal_paid / interest_paid / fees_paid`, затем создать **одну** атомарную ledger transaction с несколькими postings (уменьшение денежного счёта, изменение debt liability/receivable, сумма процентов/комиссий как расход).
- Запретить переплату по телу долга без подтверждённого сценария (advance/close); частичная оплата допустима.
- При покупке «в кредит» расход фиксируется в момент получения товара, возникает payable. Последующая выплата тела кредита **не добавляет расход повторно**.
- Платёжный план пересчитывается контролируемым use case при изменении условий; старые исполненные факты остаются неизменными.

### 7.3 Накопления

- Создание цели связывает её с отдельным `asset:savings` счётом, разрешённым в данном scope.
- `ContributeGoal` проводит **transfer** между asset accounts. `goal_progress = max(0, balance(savings_account))` (должны быть корректно учтены opening/withdrawals).
- Изменение суммы/срока цели не создаёт движение денег.
- Один накопительный счёт — одна активная цель в V1 (облегчает корректный прогресс).

### 7.4 Recurrence: платежи / задачи / события

- Шаблон хранит `rrule` (например, `FREQ=MONTHLY;BYMONTHDAY=25`), timezone, start/end и активность. Критические расчёты даты — timezone-aware.
- `ExpandOccurrences(template, range)` — чистая тестируемая функция; scheduler создаёт экземпляры в разумном окне (например, 60 дней вперёд), уникальность `(template_id, occurrence_due_at)`.
- Изменения шаблона действуют на будущие несозданные/неисполненные occurrences; исполненные не переписывать.
- **Платёж:** occurrence `due/unpaid/partial/paid/skipped`; только `pay` создаёт реальные postings.
- **Задача:** каждое occurrence имеет свою completion history; завершение этого дня не закрывает следующий.
- **Календарь:** показывать occurrences в диапазоне, не обязательно сохранять все повторения заранее; отдельная модификация экземпляра хранится как override.
- Scheduler работает с уникальным job key, на БД используется lock / `SKIP LOCKED`; retry → at-least-once execution с идемпотентными последствиями.

## 8. Календарь и уведомления

- Календарь собирает отдельные event sources: events, task due dates, recurring bill occurrences, debt due dates. DTO включает `source_type/id`, роль и scope.
- Для события `all_day=true` хранить исходную календарную дату, чтобы UTC-конвертация не сдвигала день рождения.
- Идентификатор уведомления вычисляется как `(recipient, source_type, source_id/occurrence_id, reminder_offset, channel)`, unique dedupe.
- In-app создаётся в БД до попытки push; delivery worker обрабатывает pending/failed с retry/backoff, не отправляет повтор без политики.
- Push подписка только по явному согласию; Service Worker не должен отображать содержимое другой private записи.
- После удаления семейного участника отзываются его текущие подписки на события семьи/очередь pending пересматривается.
- Для отказанного permission и неподдерживаемого браузера сохраняется in-app сценарий.

### 8.1 Расписание дней рождения

- Канонический источник: ежегодное событие `calendar_events` с `event_kind=birthday`, `birthday_date` (календарная дата без UTC-сдвига; год необязателен), `subject_name`, `subject_member_profile_id?` и timezone. Профиль участника редактирует связанную запись, а не создаёт второй источник. Связи проверяют same-scope; private день рождения не раскрывается через общий профиль.
- Три независимых правила по умолчанию: `before_day_start` с offset `-12h`; `before_day_start` с offset `-2h`; `on_date_at_time` с local_time `10:00`. Сначала вычислить ежегодную локальную дату и начало дня, затем вычесть часы для первых двух правил; 10:00 вычислять как локальное время, не как фиксированное UTC-смещение. В БД хранить UTC scheduled_at.
- Часовой пояс семейного события по умолчанию берётся из семьи, личного — из профиля владельца. Для дня рождения 29 февраля в невисокосный год occurrence приходится на 28 февраля. Покрыть тестами переход года и timezone/DST.
- Dedupe: получатель + событие + ежегодная occurrence date + rule ID + channel; retry одного правила не подавляет два других. При создании не отправлять прошедшие сроки. Изменение даты/пояса/видимости/правил отменяет старые pending attempts и пересоздаёт будущие; перед отправкой повторно проверить актуальную версию, доступ получателя и его настройки канала.
- Формы календаря и профиля показывают все три переключателя, пояс и ближайшие даты/время отправки. Текст называет человека и корректно различает «завтра», «через 2 часа» и «сегодня»; год рождения и возраст без необходимости в сообщение не добавлять.

## 9. Файлы, поиск, realtime, PWA

### 9.1 Загрузка

- Storage buckets приватные. Upload-intent проверяет принадлежность заметки/покупки/задачи, тип, размер, допустимый MIME и антивирусную стратегию; ограничения по размеру и форматам фиксировать в config.
- Файлы имеют UUID paths без пользовательских путей, metadata связывается с записью.
- Просмотр только через короткоживущие подписанные URL, с авторизацией до выдачи. Удаление ссылки → корректное удаление/cleanup файла с журналом.

### 9.2 Realtime

- Каналы только нужного scope/объекта; запросы после события перечитывают авторизованный DTO.
- Realtime нельзя считать источником авторизации. После role change / удаления участника серверный доступ обязан отказать, даже если browser channel остался.
- Для форм редактирования optimistic concurrency на основе `version`, `409 conflict` и UX «Обновить / Сохранить копию».

### 9.3 PWA и offline

- Web manifest, icons, service worker, install prompt (где поддерживается), offline fallback.
- Статические ассеты кэшируются; private/financial API ответы по умолчанию `no-store`, никогда не попадают в публичный кеш.
- Безопасные офлайн-черновики покупок/задач/заметок **не выдавать за синхронизированные**, при восстановлении соединения нужна явная индикация конфликта.
- Финансовые записи, платежи, долги и накопления **не проводить офлайн** в V1.

## 10. Дизайн-система и UX

- **Основная стилизация — SCSS Modules:** `*.module.scss` рядом с компонентом в соответствующем FSD-слайсе. Макеты страниц, виджеты, бизнес-компоненты, адаптивность и их состояния оформлять через модули; подключить `sass` в фазе 1.
- **Компоненты shadcn/ui — Tailwind CSS:** сохранять их utility-классы, варианты и состояния; не переписывать их стили на SCSS. Внешний макет и размещение компонента задавать через SCSS Module родительской обёртки.
- **Глобальные стили:** только reset, базовая типографика, подключение Tailwind и общие CSS-переменные темы. Одни и те же токены использовать в SCSS Modules и shadcn/ui; подключение Tailwind держать в отдельном CSS-файле, без Sass-обработки.
- Не задавать одно свойство одного элемента одновременно через SCSS Module и Tailwind; не использовать Tailwind как основной способ стилизации страниц и бизнес-компонентов.
- Адаптивные карточки, таблицы с мобильным list-view, sidebar для desktop, bottom navigation для mobile.
- Темы `light/dark/system`; токены цвета/типографики/радиусов в `shared/ui`. Статус дополнительно текстом, не только цветом.
- Форма быстрого ввода: покупка/задача по одному названию; финоперация требует строгих данных (счёт, сумма, тип, scope).
- В финансовом UI разделить **«доход/расход»**, **«перевод»**, **«кредит/долг»** — пользователь не должен ошибочно записывать перевод как расход.
- Доступность: focus, labelled inputs, keyboard, семантика таблиц, aria-live для подтверждений, уменьшение анимации при `prefers-reduced-motion`.
- Формат UZS: `1 250 000 сум`; дата `26.10.2026`; ошибки валидации на русском. При неизвестной стоимости — «Цена не указана».

## 11. Seed-данные

- Содержимое: 30–50 товаров с **фиктивными** ориентировочными ценами, события частичных/полных покупок, 4–8 недель финансового журнала, 2+ счетов, бюджетов, долгов с графиками, целей, recurring, заметок, задач, календаря.
- Все демонстрационные данные имеют `is_demo=true` (у связанных проводок тоже, напрямую или по родителю); отдельный явный запуск.
- Сценарий очистки удаляет исключительно demo-набор безопасно, с пересчётом/обратными записями по правилам демо-режима; **не затрагивает реальные финансовые операции**. Предпочтительно изолированная тестовая семья или demo tenant для гарантии от ошибок очистки.
- Seed deterministic, no AI; не позиционировать цены как реальные магазины Ташкента.

## 12. Тестирование: обязательная матрица

### 12.1 Unit (domain)

- Математика ledger: balanced postings, opening balances, transfers, incomes/expenses, refunds, reversals, bigint boundaries.
- Purchase partial, перепокупка, сумма факта, одна ledger связь, correction.
- Debt repayment: principal vs interest, partial, excess, all installments, loan issued/received.
- Goals: transfer ≠ expense; прогресс после пополнения/снятия.
- Budgets: monthly boundaries, timezone, refunds, overlapping overall/category budgets.
- Recurrence: ежедневно/месяц/год, последний день месяца, DST для других tz, retry idempotency.
- ACL rules: семейное/личное, child, removed, last admin, same-scope links.

### 12.2 Integration / SQL / RLS

Проверка на реальной локальной PostgreSQL (не только mock):

1. Две семьи A/B: A не читает/не изменяет ничего из B, включая прямые UUID, записи дочерних таблиц, Storage/Realtime.
2. Два пользователя внутри A: user1 private note/ledger/account/goal недоступны user2 и admin A.
3. `child` не открывает `/finance` и не проводит финансовые операции через прямой API.
4. Нельзя поменять `family_id`, `owner_user_id`, подставить чужой `account_id` или `category_id` через `UPDATE`/`INSERT`.
5. `ledger_postings` сбалансированы на commit; принудительная ошибка даёт полный rollback.
6. Повтор POST с тем же request ID/route не создаёт дубль.
7. Сторно восстанавливает баланс и корректирует отчёты; immutable history сохранена.
8. Recurring worker + notification worker при двойном запуске не создают duplicate facts.
9. RLS на views, SQL-functions, exports и signed URLs не раскрывает private rows.
10. Удаление участника обрывает доступ сразу; семейный журнал остаётся.

### 12.3 End-to-end (Playwright)

- Регистрация → создание семьи → приглашение → вход жены → ребёнок/ограниченный профиль.
- Покупка → частичная оплата → одна финансовая операция → бюджет/аналитика обновились.
- Зарплата → перевод → семейный расход → остатки и графики верные.
- Получить кредит → выплата с процентами → баланс долга и расходы верны.
- Создать цель → перевод на накопительный счёт → прогресс верный, расходы не меняются.
- Создать регулярный платёж → срок → in-app напоминание → оплата один раз.
- Повторить задачу и ежегодное событие → будущие экземпляры показаны корректно.
- Попытка читать личные данные чужого участника и другой семьи → отклонена.
- Мобильные экраны 320px и обычные планшет/desktop, темы, fallback offline.

### 12.4 Качество релиза

- `typecheck`, `lint`, `test`, `db tests`, `build`, `E2E` — без ошибок. Coverage ключевого домена `ledger/debt/budget/access` ориентир **90%+**, остального unit — достаточное для сценариев; важнее инварианты, чем формальный процент.
- Доступ к secrets в логах/сборке отсутствует; анализ зависимостей и уязвимостей.
- Backup/restore tested (не только «включён бэкап»); пройден сценарий повреждённой и повторной отправки операции.
- Промониторены HTTP/DB/cron ошибки, лимиты realtime и storage. Тест deploy/staging с анонимным и двумя авторизованными пользователями.

## 13. Эксплуатация, миграции и релизы

1. `dev → staging → production`, раздельные Supabase проекты и секреты.
2. Все изменения схемы через idempotent/versioned SQL миграции; seed в production только по подтверждённой команде.
3. `migrate → test RLS → deploy API/UI → smoke test`, rollback code без удаления несовместимых денежных таблиц.
4. Планировщик имеет защищённый endpoint с cron secret; service role только в строго ограниченных backend jobs и с ручной проверкой scope.
5. Бэкапы и политики хранения файлов, audit, экспорт собственных данных. Не обещать возможность полного удаления финансовой истории без продуманного retention.
6. Логи — request ID, тип действия, результат, безопасная ошибка; без текста личных заметок, push endpoints, полных токенов и финансовых секретов.

## 14. Anti-patterns — запрет для AI-агента

- «Сгенерировать красивый UI и заглушить Backend» — **не считать выполнением задачи**.
- Вычислять остаток в React с произвольных списков покупок без ledger.
- Изменять проведённую финансовую сумму обычным SQL `UPDATE` вместо сторно/корректировки.
- Одну таблицу `transactions` без отдельных postings и тестов баланса.
- Подписывать семейный Realtime канал по ID клиента без server/RLS права.
- Хранить деньги в JS `number` без safe integer validation; суммы `bigint` приводить к JSON number.
- Делать «последний администратор» удаляемым, показывать private контент в семейной активности.
- Отправлять секретный ключ или данные подписки push в client bundle.
- Путать план recurring/debt schedule с фактическим расходом.
- Встраивать ИИ вместо явной функциональности или без требования заказчика.

## 15. ADR — зафиксированные решения

| ADR | Решение | Последствие |
|---|---|---|
| A-01 | Separate Auth per member, shared family space | Нет общего пароля; server ACL |
| A-02 | V1 = full family finance, no AI | Большой релиз разбит на gate-фазы |
| A-03 | Financial ledger with balanced postings | Переводы, займы и сбережения не искажают расходы |
| A-04 | Strict family/private scope split | Прямой перевод между такими пространствами запрещён в V1 |
| A-05 | Next App Router + FSD `_app`/`_pages` | Нет конфликтов с роутингом Next |
| A-06 | Backend domain isolated from React/Supabase SDK | SOLID/testability, Clean Architecture |
| A-07 | Local UZS and explicit paid state | Нет ложных «расходов» из планов |
| A-08 | In-app reminders mandatory, push opt-in | Работа без push permissions |
| A-09 | No offline finance writes | Отсутствие конфликтов остатков без сети |
| A-10 | No AI until separate decision | Никаких скрытых LLM зависимостей |
| A-11 | Основная стилизация — SCSS Modules; shadcn/ui — Tailwind CSS | Стили рядом с компонентами, общие CSS-переменные темы, без дублирования свойств |
| A-12 | Фаза 1 — открытый каркас без пользовательских данных; auth/RLS подключаются в фазах 2–3 | Детали и правила разработки: `docs/adr/001-phase-one-foundation.md` |

## 16. Документация, на которую опирается реализация

- FSD overview: https://feature-sliced.design/docs/get-started/overview
- FSD + Next.js: https://fsd.how/ru/docs/guides/tech/with-nextjs/
- Next.js App Router и защита данных: https://nextjs.org/docs/app/guides/data-security
- Supabase Auth SSR: https://supabase.com/docs/guides/auth/server-side
- Supabase PostgreSQL RLS: https://supabase.com/docs/guides/database/postgres/row-level-security

Официальные источники для Telegram-интеграции:

- [Telegram Login / OIDC](https://core.telegram.org/bots/telegram-login).
- [Telegram bot deep links](https://core.telegram.org/bots/features#deep-linking).
- [Supabase custom OAuth/OIDC providers](https://supabase.com/docs/guides/auth/custom-oauth-providers).
- [Supabase Telegram OIDC example](https://supabase.com/docs/guides/self-hosting/self-hosted-custom-oauth-providers).

**Порядок реализации и Definition of Done каждой фазы:** [TASKS.md](TASKS.md).
