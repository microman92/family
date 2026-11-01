import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const url = process.env.API_URL;
if (
  !url ||
  !['127.0.0.1', 'localhost'].includes(new URL(url).hostname) ||
  !process.env.ANON_KEY ||
  !process.env.SERVICE_ROLE_KEY
)
  throw new Error('This test requires local Supabase credentials.');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SERVICE_ROLE_KEY, options);
const owner = createClient(url, process.env.ANON_KEY, options);
const other = createClient(url, process.env.ANON_KEY, options);
const guest = createClient(url, process.env.ANON_KEY, options);
const suffix = randomBytes(12).toString('hex');
const password = randomBytes(24).toString('base64url');
const ids = [];
let ownerId;
let path;
let forgedPath;
let ownerSignedIn = false;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
try {
  for (const kind of ['owner', 'other']) {
    const result = await admin.auth.admin.createUser({
      email: `family-storage-${kind}-${suffix}@example.test`,
      password,
      email_confirm: true,
    });
    assert(!result.error && result.data.user, 'Could not create local test account');
    ids.push(result.data.user.id);
  }
  [ownerId] = ids;
  assert(
    !(
      await owner.auth.signInWithPassword({
        email: `family-storage-owner-${suffix}@example.test`,
        password,
      })
    ).error,
    'Owner login failed',
  );
  ownerSignedIn = true;
  assert(
    !(
      await other.auth.signInWithPassword({
        email: `family-storage-other-${suffix}@example.test`,
        password,
      })
    ).error,
    'Other user login failed',
  );
  const image = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#aa3344' } })
    .webp()
    .toBuffer();
  path = `${ownerId}/${suffix}.webp`;
  forgedPath = `${ownerId}/${suffix}-forged.webp`;
  assert(
    !(
      await owner.storage.from('profile-avatars').upload(path, image, { contentType: 'image/webp' })
    ).error,
    'Owner upload failed',
  );
  assert(
    !(await owner.storage.from('profile-avatars').download(path)).error,
    'Owner could not read avatar',
  );
  assert(
    (await guest.storage.from('profile-avatars').download(path)).error,
    'Anonymous user downloaded avatar',
  );
  assert(
    (await guest.storage.from('profile-avatars').createSignedUrl(path, 60)).error,
    'Anonymous user signed avatar URL',
  );
  assert(
    (await other.storage.from('profile-avatars').download(path)).error,
    'Other user downloaded avatar',
  );
  assert(
    (await other.storage.from('profile-avatars').createSignedUrl(path, 60)).error,
    'Other user signed avatar URL',
  );
  assert(
    (
      await other.storage
        .from('profile-avatars')
        .upload(forgedPath, image, { contentType: 'image/webp' })
    ).error,
    'Other user uploaded to owner folder',
  );
  await other.storage.from('profile-avatars').remove([path]);
  assert(
    !(await owner.storage.from('profile-avatars').download(path)).error,
    'Other user deleted avatar',
  );
  console.log(
    'PASS: local Storage API prevents another user from reading, signing, uploading or deleting an avatar',
  );
} finally {
  let cleanupFailed = false;
  if (ownerSignedIn && path) {
    const result = await owner.storage
      .from('profile-avatars')
      .remove([path, forgedPath].filter(Boolean));
    cleanupFailed ||= !!result.error;
  }
  for (const id of ids) {
    const result = await admin.auth.admin.deleteUser(id);
    cleanupFailed = !!result.error || cleanupFailed;
  }
  if (cleanupFailed) throw new Error('Could not clean up all local storage test fixtures');
}
