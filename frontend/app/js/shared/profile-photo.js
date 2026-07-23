import { requestBlob } from '../infrastructure/backend-client.js?v=22'

let cachedPhotoKey = null
let cachedPhotoUrl = null
let pendingPhoto = null
let photoGeneration = 0

function profilePhotoKey(user) {
  return user?.foto_perfil || user?.profile_photo || null
}

async function getOwnProfilePhotoUrl(user) {
  const key = profilePhotoKey(user)
  if (!key) {
    return null
  }

  if (key === cachedPhotoKey && cachedPhotoUrl) {
    return cachedPhotoUrl
  }

  if (pendingPhoto) {
    return pendingPhoto
  }

  const requestGeneration = photoGeneration
  const requestPromise = requestBlob('/auth/profile/photo', { cache: 'no-store' })
    .then(blob => {
      const photoUrl = URL.createObjectURL(blob)
      if (requestGeneration !== photoGeneration) {
        URL.revokeObjectURL(photoUrl)
        return null
      }

      if (cachedPhotoUrl) {
        URL.revokeObjectURL(cachedPhotoUrl)
      }

      cachedPhotoKey = key
      cachedPhotoUrl = photoUrl
      return cachedPhotoUrl
    })
    .catch(() => null)
    .finally(() => {
      if (pendingPhoto === requestPromise) {
        pendingPhoto = null
      }
    })

  pendingPhoto = requestPromise
  return requestPromise
}

export async function hydrateOwnProfilePhoto(user, root = document) {
  const avatars = [...root.querySelectorAll('[data-profile-avatar]')]
  if (avatars.length === 0) {
    return false
  }

  const photoUrl = await getOwnProfilePhotoUrl(user)
  if (!photoUrl) {
    return false
  }

  avatars.forEach(avatar => {
    const image = avatar.querySelector('[data-profile-avatar-image]')
    const fallback = avatar.querySelector('[data-profile-avatar-fallback]')
    if (!image) {
      return
    }

    image.src = photoUrl
    image.hidden = false
    if (fallback) {
      fallback.hidden = true
    }
  })

  return true
}

export function invalidateOwnProfilePhoto() {
  photoGeneration += 1
  if (cachedPhotoUrl) {
    URL.revokeObjectURL(cachedPhotoUrl)
  }

  cachedPhotoKey = null
  cachedPhotoUrl = null
  pendingPhoto = null
}

globalThis.addEventListener('pagehide', event => {
  if (!event.persisted) {
    invalidateOwnProfilePhoto()
  }
})
