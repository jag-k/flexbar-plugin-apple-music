let trackCache = {
  trackId: null,
  title: null,
  artist: null,
  album: null,
  artwork: null,
  position: 0,
  duration: 0,
  isPlaying: false,
  timestamp: 0,
}

export function getCachedTrackInfo() {
  return { ...trackCache }
}

export function updateTrackCache(trackInfo, trackId) {
  if (!trackInfo) return false

  // If track ID hasn't changed and less than 5 minutes have passed, use cache
  const now = Date.now()
  const cacheExpired = now - trackCache.timestamp > 5 * 60 * 1000 // 5 minutes

  if (trackId && trackId === trackCache.trackId && !cacheExpired) {
    // Update only playback position
    trackCache.position = trackInfo.position || trackCache.position
    trackCache.isPlaying = trackInfo.isPlaying !== undefined ? trackInfo.isPlaying : trackCache.isPlaying
    return false // Cache is current, full update not required
  }

  // Update cache
  trackCache = {
    trackId: trackId || null,
    title: trackInfo.title || null,
    artist: trackInfo.artist || null,
    album: trackInfo.album || null,
    artwork: trackInfo.artwork || null,
    position: trackInfo.position || 0,
    duration: trackInfo.duration || 0,
    isPlaying: trackInfo.isPlaying || false,
    timestamp: now,
  }

  return true // Cache updated
}

export function clearTrackCache() {
  trackCache = {
    trackId: null,
    title: null,
    artist: null,
    album: null,
    artwork: null,
    position: 0,
    duration: 0,
    isPlaying: false,
    timestamp: 0,
  }
}

export function isCacheValid() {
  if (!trackCache.trackId) return false

  const now = Date.now()
  return now - trackCache.timestamp <= 5 * 60 * 1000 // 5 minutes
}

export function updatePositionInCache(position, isPlaying) {
  if (trackCache.trackId) {
    trackCache.position = position
    if (isPlaying !== undefined) {
      trackCache.isPlaying = isPlaying
    }
  }
}
