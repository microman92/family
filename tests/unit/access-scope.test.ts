import { describe, expect, it } from 'vitest';
import { sameScope, scopeFromColumns } from '@/server/modules/access/domain/scope';
import {
  hasFamilyCapability,
  type FamilyCapability,
} from '@/server/modules/access/domain/capability';

describe('Границы семейных и личных данных', () => {
  it('распознаёт только корректные пары владельца и семьи', () => {
    expect(
      scopeFromColumns({ visibility: 'family', family_id: 'family-a', owner_user_id: null }),
    ).toEqual({ visibility: 'family', familyId: 'family-a' });
    expect(
      scopeFromColumns({ visibility: 'private', family_id: null, owner_user_id: 'user-a' }),
    ).toEqual({ visibility: 'private', ownerUserId: 'user-a' });
    for (const row of [
      { visibility: 'family', family_id: null, owner_user_id: null },
      { visibility: 'family', family_id: 'family-a', owner_user_id: 'user-a' },
      { visibility: 'private', family_id: 'family-a', owner_user_id: 'user-a' },
      { visibility: 'private', family_id: null, owner_user_id: null },
      { visibility: 'public', family_id: 'family-a', owner_user_id: null },
    ])
      expect(() => scopeFromColumns(row)).toThrow('Invalid record scope');
  });

  it('разрешает связи только внутри одной семьи или личного пространства владельца', () => {
    const family = { visibility: 'family', familyId: 'family-a' } as const;
    const privateA = { visibility: 'private', ownerUserId: 'user-a' } as const;
    expect(sameScope(family, family)).toBe(true);
    expect(sameScope(family, { visibility: 'family', familyId: 'family-b' })).toBe(false);
    expect(sameScope(privateA, privateA)).toBe(true);
    expect(sameScope(privateA, { visibility: 'private', ownerUserId: 'user-b' })).toBe(false);
    expect(sameScope(family, privateA)).toBe(false);
    expect(sameScope(privateA, family)).toBe(false);
  });
});

describe('Роли участников', () => {
  it('даёт семейные финансы взрослым, управление семьёй только администратору', () => {
    for (const role of ['admin', 'member'] as const) {
      expect(hasFamilyCapability(role, 'finance.read')).toBe(true);
      expect(hasFamilyCapability(role, 'finance.write')).toBe(true);
      expect(hasFamilyCapability(role, 'members.read')).toBe(true);
    }
    expect(hasFamilyCapability('admin', 'family.manage')).toBe(true);
    expect(hasFamilyCapability('member', 'family.manage')).toBe(false);
    for (const capability of [
      'members.read',
      'family.manage',
      'finance.read',
      'finance.write',
    ] as const) {
      expect(hasFamilyCapability('child', capability)).toBe(false);
    }
    for (const invalid of ['unknown', 'constructor', '__proto__']) {
      expect(hasFamilyCapability('admin', invalid as FamilyCapability)).toBe(false);
    }
  });
});
