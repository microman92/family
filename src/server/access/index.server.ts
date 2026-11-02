import 'server-only';
import { createAuthClient } from '@/server/auth/client';
import {
  hasFamilyCapability,
  type FamilyCapability,
  type FamilyRole,
} from '@/server/modules/access/domain/capability';
import type { Scope } from '@/server/modules/access/domain/scope';
import { redirect } from 'next/navigation';

export class AccessDeniedError extends Error {
  constructor() {
    super('Access denied');
    this.name = 'AccessDeniedError';
  }
}

/** Use the Auth server, never user IDs supplied by a request. */
export async function getCurrentUser() {
  const client = await createAuthClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new AccessDeniedError();
  return { client, user: data.user };
}

export async function requireFamilyMember(familyId: string) {
  const { client, user } = await getCurrentUser();
  const { data, error } = await client
    .from('family_members')
    .select('role')
    .eq('family_id', familyId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !data || !['admin', 'member', 'child'].includes(data.role)) {
    throw new AccessDeniedError();
  }
  return { client, user, role: data.role as FamilyRole };
}

export async function requireCapability(familyId: string, capability: FamilyCapability) {
  const membership = await requireFamilyMember(familyId);
  if (!hasFamilyCapability(membership.role, capability)) throw new AccessDeniedError();
  return membership;
}

/** Resolves the active family from the verified session, not from a form or URL. */
export async function requireCurrentFamilyCapability(capability: FamilyCapability) {
  const { client, user } = await getCurrentUser();
  const { data, error } = await client
    .from('family_members')
    .select('family_id,role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (
    error ||
    !data ||
    typeof data.family_id !== 'string' ||
    !['admin', 'member', 'child'].includes(data.role) ||
    !hasFamilyCapability(data.role as FamilyRole, capability)
  ) {
    throw new AccessDeniedError();
  }
  return { client, user, familyId: data.family_id, role: data.role as FamilyRole };
}

/** Check each page request, including client-side navigation after a role change. */
export async function requireFinancePageAccess() {
  try {
    await requireCurrentFamilyCapability('finance.read');
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    redirect('/dashboard');
  }
}

/** Private access checks ownership; family access requires both membership and a capability. */
export async function assertRecordScope(scope: Scope, familyCapability: FamilyCapability) {
  if (scope.visibility === 'family') return requireCapability(scope.familyId, familyCapability);
  if (scope.visibility !== 'private') throw new AccessDeniedError();
  const actor = await getCurrentUser();
  if (scope.ownerUserId !== actor.user.id) throw new AccessDeniedError();
  return actor;
}
