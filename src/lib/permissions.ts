export type Role = 'user' | 'admin' | 'content_manager' | 'support_staff';

export interface Permission {
  action: string;
  resource: string;
}

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  admin: ['*'],
  content_manager: [
    'manage_content',
    'manage_exams',
    'manage_config',
    'manage_pricing',
    'manage_notifications'
  ],
  support_staff: [
    'view_users',
    'view_notifications'
  ],
  user: []
};

export function hasPermission(role: Role, permission: string): boolean {
  if (role === 'admin') return true;
  return ROLE_PERMISSIONS[role].includes(permission);
}
