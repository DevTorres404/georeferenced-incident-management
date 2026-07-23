import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../app/js/infrastructure/backend-client.js', () => ({
  requestBlob: vi.fn(),
}));

import { requestBlob } from '../app/js/infrastructure/backend-client.js';

describe('profile photo component', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(requestBlob).mockReset();
    document.body.innerHTML = `
      <span data-profile-avatar>
        <span data-profile-avatar-fallback>U</span>
        <img data-profile-avatar-image hidden>
      </span>
    `;
    URL.createObjectURL = vi.fn(() => 'blob:profile-photo');
    URL.revokeObjectURL = vi.fn();
  });

  it('keeps initials without requesting storage when the user has no photo', async () => {
    const { hydrateOwnProfilePhoto } = await import('../app/js/shared/profile-photo.js');

    await expect(hydrateOwnProfilePhoto({ foto_perfil: null })).resolves.toBe(false);
    expect(requestBlob).not.toHaveBeenCalled();
    expect(document.querySelector('[data-profile-avatar-fallback]').hidden).toBe(false);
  });

  it('hydrates every avatar with the authenticated RustFS photo', async () => {
    vi.mocked(requestBlob).mockResolvedValue(new Blob(['avatar'], { type: 'image/jpeg' }));
    const { hydrateOwnProfilePhoto } = await import('../app/js/shared/profile-photo.js');

    await expect(hydrateOwnProfilePhoto({ foto_perfil: 'profile-photos/users/1/avatar.jpg' }))
      .resolves.toBe(true);

    expect(requestBlob).toHaveBeenCalledWith('/auth/profile/photo', { cache: 'no-store' });
    expect(document.querySelector('[data-profile-avatar-image]').hidden).toBe(false);
    expect(document.querySelector('[data-profile-avatar-fallback]').hidden).toBe(true);
  });

  it('revokes the previous object URL when the photo changes', async () => {
    vi.mocked(requestBlob).mockResolvedValue(new Blob(['avatar'], { type: 'image/jpeg' }));
    const { hydrateOwnProfilePhoto, invalidateOwnProfilePhoto } = await import('../app/js/shared/profile-photo.js');

    await hydrateOwnProfilePhoto({ foto_perfil: 'profile-photos/users/1/avatar.jpg' });
    invalidateOwnProfilePhoto();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:profile-photo');
  });

  it('discards an older photo request after invalidation', async () => {
    let resolvePhoto;
    vi.mocked(requestBlob).mockReturnValue(new Promise((resolve) => {
      resolvePhoto = resolve;
    }));
    const { hydrateOwnProfilePhoto, invalidateOwnProfilePhoto } = await import('../app/js/shared/profile-photo.js');

    const hydration = hydrateOwnProfilePhoto({ foto_perfil: 'profile-photos/users/1/old.jpg' });
    invalidateOwnProfilePhoto();
    resolvePhoto(new Blob(['old-avatar'], { type: 'image/jpeg' }));

    await expect(hydration).resolves.toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:profile-photo');
    expect(document.querySelector('[data-profile-avatar-image]').hidden).toBe(true);
  });
});
