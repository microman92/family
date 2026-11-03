'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { ArrowLeft, Check, ChevronRight, Plus } from 'lucide-react';
import { Button, Icon } from '@/shared/ui';
import type { AuthState } from '@/shared/lib/auth';
import { suggestShoppingUnit } from '../model/suggest-unit';
import styles from './shopping-item-stepper.module.scss';

type Category = { value: string; name: string; icon: string };

export function ShoppingItemStepper({
  categories,
  members,
  scope,
  save,
}: {
  categories: Category[];
  members: { member_id: string; display_name: string }[];
  scope: 'family' | 'private';
  save: (state: AuthState, form: FormData) => Promise<AuthState>;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [manualUnit, setManualUnit] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<AuthState>({});
  const [pending, startTransition] = useTransition();
  const requestId = useRef<string | null>(null);
  const submitting = useRef(false);
  const focusNext = useRef(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const categoryHeading = useRef<HTMLHeadingElement>(null);
  const selected = categories.find((item) => item.value === category);
  const unit = manualUnit ?? suggestShoppingUnit(title, category ?? '');

  useEffect(() => {
    if (pending || !focusNext.current) return;
    focusNext.current = false;
    if (selected) titleInput.current?.focus();
    else categoryHeading.current?.focus();
  }, [pending, selected]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const form = event.currentTarget;
    const data = new FormData(form);
    const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') ?? 'more';
    requestId.current ??= crypto.randomUUID();
    data.set('requestId', requestId.current);
    setFeedback({});
    startTransition(async () => {
      try {
        const result = await save({}, data);
        setFeedback(result);
        if (result.error) return;
        requestId.current = null;
        form.reset();
        setTitle('');
        setManualUnit(null);
        focusNext.current = true;
        if (intent === 'finish') setCategory(null);
      } catch {
        setFeedback({
          error: 'Связь с сервером прервалась. Повторите сохранение.',
        });
      } finally {
        submitting.current = false;
      }
    });
  }

  return (
    <section className={styles.stepper} aria-labelledby="new-shopping-position">
      <header className={styles.header}>
        <h2 id="new-shopping-position">Новая позиция</h2>
        <ol className={styles.steps} aria-label="Шаги добавления покупки">
          <li aria-current={!selected ? 'step' : undefined}>
            <span aria-hidden="true">{selected ? <Check size={14} /> : '1'}</span> Категория
          </li>
          <li aria-current={selected ? 'step' : undefined}>
            <span aria-hidden="true">2</span> Позиции
          </li>
        </ol>
      </header>
      {feedback.message && (
        <p role="status" className={styles.success}>
          <Check size={16} aria-hidden="true" />
          {feedback.message}
        </p>
      )}
      <div hidden={!selected}>
        <div className={styles.selected}>
          <div>
            <span className={styles.eyebrow}>Добавляем в категорию</span>
            <h3>{selected?.name}</h3>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              setCategory(null);
              setFeedback({});
              focusNext.current = true;
            }}
          >
            <ArrowLeft />
            Сменить категорию
          </Button>
        </div>
        <form onSubmit={submit} aria-busy={pending}>
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="category" value={selected?.value ?? ''} />
          <fieldset disabled={pending} className={styles.fields}>
            <label className={styles.titleField}>
              Название покупки
              <input
                ref={titleInput}
                name="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                required
                placeholder={
                  category === 'preset:food' ? 'Например, картошка' : 'Что нужно купить?'
                }
              />
            </label>
            <label>
              Количество
              <input
                name="qty"
                type="number"
                inputMode="decimal"
                min="0.001"
                max="999999999"
                step="0.001"
                defaultValue="1"
                required
              />
            </label>
            <label>
              Единица
              <input
                name="unit"
                value={unit}
                onChange={(event) => setManualUnit(event.target.value)}
                maxLength={24}
                required
                list="shopping-units"
              />
            </label>
            <datalist id="shopping-units">
              <option value="шт" />
              <option value="кг" />
              <option value="г" />
              <option value="л" />
              <option value="упак" />
            </datalist>
            <label className={styles.priceField}>
              Цена за единицу, сум <span className={styles.optional}>необязательно</span>
              <input
                name="price"
                type="number"
                inputMode="numeric"
                min="0"
                max="999999999999"
                step="1"
                placeholder="Можно указать позже"
              />
            </label>
            <p className={styles.hint}>
              Единицу можно изменить. Неизвестную цену оставьте пустой и допишите в списке позже.
            </p>
            <details className={styles.options}>
              <summary>Дополнительные параметры</summary>
              <div className={styles.extraFields}>
                <label>
                  Срочность
                  <select name="priority" defaultValue="normal">
                    <option value="normal">Обычная</option>
                    <option value="urgent">Срочно</option>
                  </select>
                </label>
                <label>
                  Дата
                  <input name="due" type="date" />
                </label>
                {scope === 'family' && (
                  <label>
                    Ответственный
                    <select name="assigned" defaultValue="">
                      <option value="">Не назначен</option>
                      {members.map((member) => (
                        <option key={member.member_id} value={member.member_id}>
                          {member.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className={styles.checkbox}>
                  <input name="big" type="checkbox" />
                  Крупная покупка
                </label>
              </div>
            </details>
            {feedback.error && (
              <p role="alert" className={styles.error}>
                {feedback.error}
              </p>
            )}
            <div className={styles.actions}>
              <Button type="submit" value="more" disabled={pending}>
                <Plus />
                {pending ? 'Сохраняем…' : 'Добавить ещё'}
              </Button>
              {title.trim() ? (
                <Button type="submit" value="finish" variant="outline" disabled={pending}>
                  Добавить и завершить
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={(event) => {
                    event.currentTarget.form?.reset();
                    setCategory(null);
                    setTitle('');
                    setManualUnit(null);
                    requestId.current = null;
                    focusNext.current = true;
                  }}
                >
                  Готово
                </Button>
              )}
            </div>
          </fieldset>
        </form>
      </div>
      <div hidden={Boolean(selected)}>
        <h3 ref={categoryHeading} tabIndex={-1} className={styles.categoryHeading}>
          Что будем покупать?
        </h3>
        <p className={styles.hint}>
          Выберите категорию один раз, затем добавляйте в неё позиции подряд.
        </p>
        <div className={styles.categories}>
          {categories.map((item) => (
            <button
              key={item.value}
              type="button"
              className={styles.category}
              onClick={() => {
                setCategory(item.value);
                setFeedback({});
                focusNext.current = true;
              }}
            >
              <span className={styles.categoryIcon}>
                <Icon
                  name={
                    (['shopping', 'home', 'notes', 'goal'].includes(item.icon)
                      ? item.icon
                      : 'shopping') as 'shopping' | 'home' | 'notes' | 'goal'
                  }
                  size={20}
                />
              </span>
              <span>{item.name}</span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
