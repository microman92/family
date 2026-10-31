import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.API_URL;
const mailUrl = process.env.MAILPIT_URL || process.env.INBUCKET_URL;
if (
  !url ||
  !mailUrl ||
  !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
  !['localhost', '127.0.0.1'].includes(new URL(mailUrl).hostname)
) {
  throw new Error('This test only runs against local Supabase and local mail.');
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SERVICE_ROLE_KEY, options);
const client = createClient(url, process.env.ANON_KEY, options);
const email = `family-test-${randomBytes(12).toString('hex')}@example.test`;
const oldPassword = randomBytes(24).toString('base64url');
const newPassword = randomBytes(24).toString('base64url');
let userId;
let messageId;
const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};
try {
  const signup = await client.auth.signUp({ email, password: oldPassword });
  ensure(!signup.error && signup.data.user, 'Signup failed');
  userId = signup.data.user.id;
  ensure(!(await client.auth.signOut({ scope: 'local' })).error, 'Sign-out failed');
  ensure(
    !(await client.auth.signInWithPassword({ email, password: oldPassword })).error,
    'Password login failed',
  );
  ensure(!(await client.auth.signOut({ scope: 'local' })).error, 'Sign-out failed');
  ensure(
    !(
      await client.auth.resetPasswordForEmail(email, {
        redirectTo: 'http://127.0.0.1:3000/update-password',
      })
    ).error,
    'Password recovery request failed',
  );
  for (let attempt = 0; attempt < 20; attempt++) {
    const inbox = await (await fetch(new URL('/api/v1/messages', mailUrl))).json();
    const message = inbox.messages?.find((item) => item.To?.some((to) => to.Address === email));
    if (message) {
      messageId = message.ID;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  ensure(messageId, 'Recovery email was not delivered locally');
  const message = await (await fetch(new URL(`/api/v1/message/${messageId}`, mailUrl))).json();
  const link = (message.Text || message.HTML || '')
    .match(/https?:\/\/[^\s"<>]+\/auth\/v1\/verify\?[^\s"<>]+/)?.[0]
    ?.replaceAll('&amp;', '&');
  ensure(
    link && new URL(link).origin === new URL(url).origin,
    'Recovery link missing or unexpected',
  );
  const response = await fetch(link, { redirect: 'manual' });
  const location = response.headers.get('location');
  ensure(response.status >= 300 && response.status < 400 && location, 'Recovery link failed');
  const fragment = new URLSearchParams(new URL(location).hash.slice(1));
  const access_token = fragment.get('access_token');
  const refresh_token = fragment.get('refresh_token');
  ensure(access_token && refresh_token, 'Recovery session missing');
  ensure(
    !(await client.auth.setSession({ access_token, refresh_token })).error,
    'Recovery session rejected',
  );
  ensure(
    !(await client.auth.updateUser({ password: newPassword })).error,
    'Password update failed',
  );
  await client.auth.signOut({ scope: 'local' });
  ensure(
    !(await client.auth.signInWithPassword({ email, password: newPassword })).error,
    'Login with new password failed',
  );
  await client.auth.signOut({ scope: 'local' });
  console.log('PASS: local signup, login, logout, recovery email, password update and new login');
} finally {
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error('Failed to clean up local test account');
  }
  if (messageId)
    await fetch(new URL('/api/v1/messages', mailUrl), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ IDs: [messageId] }),
    });
}
