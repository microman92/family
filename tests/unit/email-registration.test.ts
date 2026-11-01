import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ signup: vi.fn(), signOut: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock('@/server/auth/invite-cookie', () => ({
  clearRememberedInvite: async () => {},
  rememberInvite: async () => true,
}));
vi.mock('@/server/auth/config', () => ({
  getSupabaseConfig: () => ({ url: 'https://supabase.test', key: 'test' }),
}));
vi.mock('@/server/auth/client', () => ({
  createAuthClient: async () => ({ auth: { signUp: state.signup, signOut: state.signOut } }),
}));
import { authenticate } from '@/server/auth/actions';

afterEach(() => {
  vi.unstubAllEnvs();
  state.signup.mockReset();
  state.signOut.mockReset();
});
function credentials() {
  const form = new FormData();
  form.set('email', 'user@example.com');
  form.set('password', 'password123');
  return form;
}

describe('Регистрация по почте', () => {
  it('направляет на вход и просит подтвердить почту при отсутствии сессии', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://family.example');
    state.signup.mockResolvedValue({ data: { session: null }, error: null });
    await expect(authenticate('register', {}, credentials())).rejects.toThrow(
      'redirect:/login?registered=check-email',
    );
    expect(state.signup.mock.calls[0]![0].options.emailRedirectTo).toBe(
      'https://family.example/auth/callback?registered=email',
    );
    expect(state.signOut).not.toHaveBeenCalled();
  });
  it('при мгновенной регистрации завершает сессию перед отправкой на вход', async () => {
    state.signup.mockResolvedValue({ data: { session: { access_token: 'test' } }, error: null });
    state.signOut.mockResolvedValue({ error: null });
    await expect(authenticate('register', {}, credentials())).rejects.toThrow(
      'redirect:/login?registered=success',
    );
    expect(state.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
  it('не сообщает об успешном выходе если завершение сессии не удалось', async () => {
    state.signup.mockResolvedValue({ data: { session: {} }, error: null });
    state.signOut.mockResolvedValue({ error: new Error('failed') });
    expect(await authenticate('register', {}, credentials())).toHaveProperty('error');
  });
});
