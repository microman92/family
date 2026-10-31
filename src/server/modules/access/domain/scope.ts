/** Family and personal records have disjoint ownership. IDs come from verified database rows. */
export type Scope =
  { visibility: 'family'; familyId: string } | { visibility: 'private'; ownerUserId: string };

export type ScopedColumns = {
  visibility: string;
  family_id: string | null;
  owner_user_id: string | null;
};

/** Reject malformed database rows rather than treating them as either scope. */
export function scopeFromColumns(row: ScopedColumns): Scope {
  if (
    row.visibility === 'family' &&
    typeof row.family_id === 'string' &&
    row.family_id.length > 0 &&
    row.owner_user_id === null
  ) {
    return { visibility: 'family', familyId: row.family_id };
  }
  if (
    row.visibility === 'private' &&
    row.family_id === null &&
    typeof row.owner_user_id === 'string' &&
    row.owner_user_id.length > 0
  ) {
    return { visibility: 'private', ownerUserId: row.owner_user_id };
  }
  throw new Error('Invalid record scope');
}

/** Linked records and updates must not cross family/personal boundaries. */
export function sameScope(left: Scope, right: Scope): boolean {
  if (left.visibility === 'family' && right.visibility === 'family') {
    return left.familyId === right.familyId;
  }
  if (left.visibility === 'private' && right.visibility === 'private') {
    return left.ownerUserId === right.ownerUserId;
  }
  return false;
}
