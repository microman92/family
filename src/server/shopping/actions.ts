'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  AccessDeniedError,
  getCurrentUser,
  requireCurrentFamilyCapability,
} from '@/server/access/index.server';
import type { AuthState } from '@/shared/lib/auth';

function parseShoppingFields(form: FormData) {
  const fields = z
    .object({
      title: z.string().trim().min(1).max(200),
      qty: z
        .string()
        .regex(/^(?:[0-9]{1,9})(?:\.[0-9]{1,3})?$/)
        .refine((value) => Number(value) > 0),
      unit: z.string().trim().min(1).max(24),
      price: z.union([z.literal(''), z.string().regex(/^[0-9]{1,12}$/)]),
      priority: z.enum(['normal', 'urgent']),
      location: z.enum(['', 'store', 'market', 'online']),
      category: z
        .string()
        .toLowerCase()
        .regex(/^(?:|preset:[a-z]+|custom:[0-9a-f-]{36})$/),
      due: z.union([z.literal(''), z.iso.date()]),
      assigned: z.union([z.literal(''), z.uuid().toLowerCase()]),
    })
    .safeParse({
      title: form.get('title'),
      qty: form.get('qty') || '1',
      unit: form.get('unit') || 'шт',
      price: form.get('price') || '',
      priority: form.get('priority') || 'normal',
      location: form.get('location') || '',
      category: form.get('category') || '',
      due: form.get('due') || '',
      assigned: form.get('assigned') || '',
    });
  if (!fields.success) return null;
  return {
    title: fields.data.title,
    planned_qty: fields.data.qty,
    unit: fields.data.unit,
    planned_unit_price: fields.data.price ? BigInt(fields.data.price).toString() : null,
    priority: fields.data.priority,
    location: fields.data.location || null,
    preset_id: fields.data.category.startsWith('preset:') ? fields.data.category.slice(7) : null,
    category_id: fields.data.category.startsWith('custom:') ? fields.data.category.slice(7) : null,
    due_date: fields.data.due || null,
    assigned_to: fields.data.assigned || null,
    big_purchase: form.get('big') === 'on',
  };
}

async function insertShoppingItem(form: FormData, requestId?: string): Promise<AuthState> {
  const scope = form.get('scope') === 'private' ? 'private' : 'family';
  const fields = parseShoppingFields(form);
  if (!fields) return { error: 'Проверьте название, количество и остальные поля покупки.' };
  const { client, user } = await getCurrentUser();
  const family = scope === 'family' ? await requireCurrentFamilyCapability('members.read') : null;
  const values = {
    visibility: scope,
    family_id: family?.familyId ?? null,
    owner_user_id: scope === 'private' ? user.id : null,
    ...fields,
  };
  const { error } = await client.from('shopping_items').insert({
    ...values,
    ...(requestId ? { id: requestId } : {}),
  });
  if (error?.code === '23505' && requestId) {
    const { data: existing, error: readError } = await client
      .from('shopping_items')
      .select(
        'title,planned_qty,unit,planned_unit_price,priority,location,preset_id,category_id,due_date,assigned_to,big_purchase,visibility,family_id,owner_user_id,deleted_at',
      )
      .eq('id', requestId)
      .maybeSingle();
    const matches =
      existing &&
      Object.entries(values).every(([key, value]) => {
        if (key === 'planned_qty') return Number(existing[key]) === Number(value);
        return String(existing[key as keyof typeof values] ?? '') === String(value ?? '');
      });
    if (readError || !matches)
      return {
        error: 'Не удалось подтвердить сохранение. Обновите список перед повторным добавлением.',
      };
    if (existing?.deleted_at) {
      revalidatePath('/shopping');
      return { message: 'Позиция уже удалена.' };
    }
  } else if (error) {
    return {
      error:
        'Не удалось добавить покупку. Проверьте категорию и остальные поля, затем попробуйте снова.',
    };
  }
  revalidatePath('/shopping');
  return { message: 'Позиция добавлена.' };
}

export async function addShoppingItem(form: FormData) {
  const scope = form.get('scope') === 'private' ? 'private' : 'family';
  if (!parseShoppingFields(form)) redirect(`/shopping?scope=${scope}&error=fields`);
  const state = await insertShoppingItem(form);
  if (state.error) redirect(`/shopping?scope=${scope}&error=save`);
  redirect(`/shopping?scope=${scope}`);
}

export async function addShoppingPosition(_state: AuthState, form: FormData): Promise<AuthState> {
  const requestId = z.uuid().safeParse(form.get('requestId'));
  if (
    !requestId.success ||
    !['family', 'private'].includes(String(form.get('scope'))) ||
    !form.get('category')
  )
    return { error: 'Выберите категорию и повторите добавление.' };
  try {
    return await insertShoppingItem(form, requestId.data);
  } catch (error) {
    if (error instanceof AccessDeniedError)
      return { error: 'Нет доступа к этому списку. Войдите снова или проверьте участие в семье.' };
    throw error;
  }
}

export async function updateShoppingItem(
  form: FormData,
): Promise<'updated' | 'invalid' | 'conflict' | 'error'> {
  const scope = form.get('scope') === 'private' ? 'private' : 'family';
  const fields = z
    .object({
      id: z.uuid(),
      version: z.coerce.number().int().positive().max(2147483646),
    })
    .safeParse({ id: form.get('id'), version: form.get('version') });
  const item = parseShoppingFields(form);
  if (!fields.success || !item) return 'invalid';
  const { client, user } = await getCurrentUser();
  const family = scope === 'family' ? await requireCurrentFamilyCapability('members.read') : null;
  let query = client
    .from('shopping_items')
    .update({ ...item, version: fields.data.version + 1 })
    .eq('id', fields.data.id)
    .eq('version', fields.data.version)
    .is('deleted_at', null)
    .eq('visibility', scope);
  query =
    scope === 'family'
      ? query.eq('family_id', family!.familyId)
      : query.eq('owner_user_id', user.id);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) return 'error';
  if (!data) return 'conflict';
  revalidatePath('/shopping');
  return 'updated';
}

export async function deleteShoppingItem(_state: AuthState, form: FormData): Promise<AuthState> {
  const fields = z
    .object({
      id: z.uuid(),
      version: z.coerce.number().int().positive().max(2147483646),
      scope: z.enum(['family', 'private']),
    })
    .safeParse({ id: form.get('id'), version: form.get('version'), scope: form.get('scope') });
  if (!fields.success) return { error: 'Не удалось определить позицию. Обновите список.' };
  try {
    const { client, user } = await getCurrentUser();
    const { scope, id, version } = fields.data;
    const family = scope === 'family' ? await requireCurrentFamilyCapability('members.read') : null;
    const scopeColumn = scope === 'family' ? 'family_id' : 'owner_user_id';
    const scopeId = family?.familyId ?? user.id;
    const { data, error } = await client
      .from('shopping_items')
      .update({ deleted_at: new Date().toISOString(), version: version + 1 })
      .eq('id', id)
      .eq('version', version)
      .eq('visibility', scope)
      .eq(scopeColumn, scopeId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();
    if (error) return { error: 'Не удалось удалить позицию. Попробуйте ещё раз.' };
    if (!data) {
      const existing = await client
        .from('shopping_items')
        .select('deleted_at')
        .eq('id', id)
        .eq('visibility', scope)
        .eq(scopeColumn, scopeId)
        .maybeSingle();
      if (existing.error) return { error: 'Не удалось проверить позицию. Попробуйте ещё раз.' };
      if (existing.data && !existing.data.deleted_at)
        return { error: 'Позиция изменилась. Обновите список перед удалением.' };
    }
    revalidatePath('/shopping');
    return { message: 'Позиция удалена.' };
  } catch (error) {
    if (error instanceof AccessDeniedError)
      return { error: 'Нет доступа к этому списку. Войдите снова.' };
    throw error;
  }
}

export async function saveShoppingCategory(form: FormData) {
  const scope = form.get('scope') === 'private' ? 'private' : 'family';
  const fields = z
    .object({
      id: z.union([z.literal(''), z.uuid()]),
      name: z.string().trim().min(1).max(80),
      icon: z.enum(['shopping', 'home', 'notes', 'goal']),
      color: z.union([z.literal(''), z.string().regex(/^#[0-9a-fA-F]{6}$/)]),
    })
    .safeParse({
      id: form.get('id') || '',
      name: form.get('name'),
      icon: form.get('icon'),
      color: form.get('color') || '',
    });
  if (!fields.success) redirect(`/shopping?scope=${scope}&error=fields`);
  const { client, user } = await getCurrentUser();
  const family = scope === 'family' ? await requireCurrentFamilyCapability('members.read') : null;
  const columns = {
    name: fields.data.name,
    icon: fields.data.icon,
    color: fields.data.color || null,
  };
  let error;
  if (fields.data.id) {
    let query = client
      .from('shopping_categories')
      .update(columns)
      .eq('id', fields.data.id)
      .eq('visibility', scope);
    query =
      scope === 'family'
        ? query.eq('family_id', family!.familyId)
        : query.eq('owner_user_id', user.id);
    ({ error } = await query);
  } else {
    ({ error } = await client.from('shopping_categories').insert({
      ...columns,
      visibility: scope,
      family_id: family?.familyId ?? null,
      owner_user_id: scope === 'private' ? user.id : null,
    }));
  }
  if (error) redirect(`/shopping?scope=${scope}&error=save`);
  revalidatePath('/shopping');
  redirect(`/shopping?scope=${scope}`);
}

export async function archiveShoppingCategory(form: FormData) {
  const scope = form.get('scope') === 'private' ? 'private' : 'family';
  const id = z.uuid().safeParse(form.get('id'));
  if (!id.success) redirect(`/shopping?scope=${scope}&error=fields`);
  const { client, user } = await getCurrentUser();
  const family = scope === 'family' ? await requireCurrentFamilyCapability('members.read') : null;
  let query = client
    .from('shopping_categories')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id.data)
    .eq('visibility', scope);
  query =
    scope === 'family'
      ? query.eq('family_id', family!.familyId)
      : query.eq('owner_user_id', user.id);
  const { error } = await query;
  if (error) redirect(`/shopping?scope=${scope}&error=save`);
  revalidatePath('/shopping');
  redirect(`/shopping?scope=${scope}`);
}
