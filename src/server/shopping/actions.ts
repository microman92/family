'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getCurrentUser, requireCurrentFamilyCapability } from '@/server/access/index.server';

export async function addShoppingItem(form: FormData) {
  const scope = form.get('scope') === 'private' ? 'private' : 'family';
  const title = z.string().trim().min(1).max(200).safeParse(form.get('title'));
  if (!title.success) redirect(`/shopping?scope=${scope}&error=title`);
  const fields = z
    .object({
      qty: z
        .string()
        .regex(/^(?:[0-9]{1,9})(?:\.[0-9]{1,3})?$/)
        .refine((value) => Number(value) > 0),
      unit: z.string().trim().min(1).max(24),
      price: z.union([z.literal(''), z.string().regex(/^[0-9]{1,12}$/)]),
      priority: z.enum(['normal', 'urgent']),
      location: z.enum(['', 'store', 'market', 'online']),
      category: z.string().regex(/^(?:|preset:[a-z]+|custom:[0-9a-f-]{36})$/i),
      due: z.union([z.literal(''), z.iso.date()]),
      assigned: z.union([z.literal(''), z.uuid()]),
    })
    .safeParse({
      qty: form.get('qty') || '1',
      unit: form.get('unit') || 'шт',
      price: form.get('price') || '',
      priority: form.get('priority') || 'normal',
      location: form.get('location') || '',
      category: form.get('category') || '',
      due: form.get('due') || '',
      assigned: form.get('assigned') || '',
    });
  if (!fields.success) redirect(`/shopping?scope=${scope}&error=fields`);
  const { client, user } = await getCurrentUser();
  const family = scope === 'family' ? await requireCurrentFamilyCapability('members.read') : null;
  const { error } = await client.from('shopping_items').insert({
    visibility: scope,
    family_id: family?.familyId ?? null,
    owner_user_id: scope === 'private' ? user.id : null,
    title: title.data,
    planned_qty: fields.data.qty,
    unit: fields.data.unit,
    planned_unit_price: fields.data.price || null,
    priority: fields.data.priority,
    location: fields.data.location || null,
    preset_id: fields.data.category.startsWith('preset:') ? fields.data.category.slice(7) : null,
    category_id: fields.data.category.startsWith('custom:') ? fields.data.category.slice(7) : null,
    due_date: fields.data.due || null,
    assigned_to: fields.data.assigned || null,
    big_purchase: form.get('big') === 'on',
  });
  if (error) redirect(`/shopping?scope=${scope}&error=save`);
  revalidatePath('/shopping');
  redirect(`/shopping?scope=${scope}`);
}

export async function renameShoppingItem(form: FormData) {
  const scope = form.get('scope') === 'private' ? 'private' : 'family';
  const fields = z
    .object({
      id: z.uuid(),
      title: z.string().trim().min(1).max(200),
      version: z.coerce.number().int().positive().max(2147483646),
    })
    .safeParse({ id: form.get('id'), title: form.get('title'), version: form.get('version') });
  if (!fields.success) redirect(`/shopping?scope=${scope}&error=fields`);
  const { client, user } = await getCurrentUser();
  const family = scope === 'family' ? await requireCurrentFamilyCapability('members.read') : null;
  let query = client
    .from('shopping_items')
    .update({ title: fields.data.title, version: fields.data.version + 1 })
    .eq('id', fields.data.id)
    .eq('version', fields.data.version)
    .eq('visibility', scope);
  query =
    scope === 'family'
      ? query.eq('family_id', family!.familyId)
      : query.eq('owner_user_id', user.id);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) redirect(`/shopping?scope=${scope}&error=save`);
  if (!data) redirect(`/shopping?scope=${scope}&error=conflict`);
  revalidatePath('/shopping');
  redirect(`/shopping?scope=${scope}`);
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
