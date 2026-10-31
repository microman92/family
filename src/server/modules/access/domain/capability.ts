export type FamilyRole = 'admin' | 'member' | 'child';
export type FamilyCapability = 'members.read' | 'family.manage' | 'finance.read' | 'finance.write';

const capabilities: Record<FamilyCapability, readonly FamilyRole[]> = {
  'members.read': ['admin', 'member'],
  'family.manage': ['admin'],
  'finance.read': ['admin', 'member'],
  'finance.write': ['admin', 'member'],
};

/** Child capabilities are denied until a specific permission is designed and enforced. */
export function hasFamilyCapability(role: FamilyRole, capability: FamilyCapability): boolean {
  return capabilities[capability].includes(role);
}
