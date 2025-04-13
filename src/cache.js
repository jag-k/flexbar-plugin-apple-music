// cache.js
let trackCache = {
    trackId: null,
    title: null,
    artist: null,
    album: null,
    artwork: null,
    position: 0,
    duration: 0,
    isPlaying: false,
    timestamp: 0
};

export function getCachedTrackInfo() {
    return { ...trackCache };
}

export function updateTrackCache(trackInfo, trackId) {
    if (!trackInfo) return false;

    // Если ID трека не изменился и прошло менее 5 минут, используем кеш
    const now = Date.now();
    const cacheExpired = now - trackCache.timestamp > 5 * 60 * 1000; // 5 минут

    if (trackId && trackId === trackCache.trackId && !cacheExpired) {
        // Обновляем только позицию воспроизведения
        trackCache.position = trackInfo.position || trackCache.position;
        trackCache.isPlaying = trackInfo.isPlaying !== undefined ? trackInfo.isPlaying : trackCache.isPlaying;
        return false; // Кеш актуален, полное обновление не требуется
    }

    // Обновляем кеш
    trackCache = {
        trackId: trackId || null,
        title: trackInfo.title || null,
        artist: trackInfo.artist || null,
        album: trackInfo.album || null,
        artwork: trackInfo.artwork || null,
        position: trackInfo.position || 0,
        duration: trackInfo.duration || 0,
        isPlaying: trackInfo.isPlaying || false,
        timestamp: now
    };

    return true; // Кеш обновлен
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
        timestamp: 0
    };
}

export function isCacheValid() {
    if (!trackCache.trackId) return false;

    const now = Date.now();
    return now - trackCache.timestamp <= 5 * 60 * 1000; // 5 минут
}

export function updatePositionInCache(position, isPlaying) {
    if (trackCache.trackId) {
        trackCache.position = position;
        if (isPlaying !== undefined) {
            trackCache.isPlaying = isPlaying;
        }
    }
}
