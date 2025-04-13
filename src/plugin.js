import { plugin, logger } from "@eniac/flexdesigner";
import { keyData, updateIntervals, connectedDevices, DEFAULT_SETTINGS, PLUGIN_UUID } from "./consts";
import { getTrackInfoWithAppleScript, togglePlayPause, nextTrack, previousTrack, getPlaybackPosition } from "./music_control";
import { getCachedTrackInfo } from "./cache";


// Форматирование времени в формате MM:SS
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Безопасное рисование на устройстве с проверкой подключения
 */
function safeDraw(serialNumber, key, type) {
    if (connectedDevices.has(serialNumber)) {
        try {
            // Создаем новый объект с только необходимыми свойствами
            const keyToDraw = {
                uid: key.uid,
                cid: key.cid,
                title: key.title,
                style: { ...key.style },
                data: { ...key.data }
            };

            plugin.draw(serialNumber, keyToDraw, type).catch(() => { });
        } catch (error) {
            console.error(`Error drawing to device ${serialNumber}:`, error);
            logger.error(`Error drawing to device ${serialNumber}:`, error);
        }
    } else {
        logger.warn(`Attempted to draw to disconnected device: ${serialNumber}`);
    }
}

/**
 * Полное обновление данных о треке на ключе (вызывается раз в 3 секунды)
 */
async function updateTrackInfo(serialNumber, key) {
    if (!connectedDevices.has(serialNumber)) {
        logger.warn(`Device ${serialNumber} not connected, skipping track info update`);
        return;
    }

    logger.info("Updating full track info for key:", key.cid);
    const trackInfo = await getTrackInfoWithAppleScript();

    // Создаем копию стилей для модификации
    let newStyle = { ...key.style };
    let newTitle = key.title;

    if (!trackInfo) {
        logger.error("Failed to get track info");
        newStyle.showIcon = true;
        newStyle.showTitle = true;
        newStyle.icon = "mdi mdi-music-off";
        newTitle = "No track info";
        newStyle.showProgress = false;
    } else {
        if (trackInfo.title !== "No track is playing") {
            newStyle.showTitle = true;

            // Добавляем информацию о времени воспроизведения
            const currentTime = formatTime(trackInfo.position);
            const totalTime = formatTime(trackInfo.duration);

            // Устанавливаем текст с информацией о треке и времени
            newTitle = `${trackInfo.title}\n${trackInfo.artist}`;

            // Настраиваем прогресс-бар
            if (key.data.showProgress !== false) {
                const progress = trackInfo.duration > 0 ? (trackInfo.position / trackInfo.duration) : 0;
                newStyle.progress = progress;
                newStyle.showProgress = true;
                newStyle.progressBarColor = key.data.progressBarColor || "#1ED760"; // Зеленый цвет по умолчанию
            }

            // Всегда показываем обложку, если она доступна
            if (trackInfo.artwork && trackInfo.artwork.startsWith('data:image')) {
                logger.info("Setting artwork icon");
                newStyle.showIcon = true;
                newStyle.icon = trackInfo.artwork;
            } else {
                logger.info("Using default music icon");
                newStyle.showIcon = true;
                newStyle.icon = 'mdi mdi-music';
            }
            logger.info("Updated track info:", newTitle);
        } else {
            logger.info("No track playing");
            newStyle.showIcon = true;
            newStyle.showTitle = true;
            newStyle.icon = "mdi mdi-music-off";
            newTitle = "No track playing";
            newStyle.showProgress = false;
        }
    }

    key.style = newStyle;
    key.title = newTitle;

    safeDraw(serialNumber, key, 'draw');
}

/**
 * Обновление только прогресса воспроизведения (вызывается чаще, раз в секунду)
 */
async function updateProgressOnly(serialNumber, key) {
    if (!connectedDevices.has(serialNumber)) {
        return;
    }

    // Получаем только позицию воспроизведения (легкий запрос)
    const { position, duration, isPlaying } = await getPlaybackPosition();

    // Если трек не воспроизводится, не обновляем прогресс
    if (!isPlaying) {
        return;
    }

    // Получаем текущую информацию о треке из кеша
    const cachedInfo = getCachedTrackInfo();

    // Если в кеше нет информации о треке, не обновляем прогресс
    if (!cachedInfo.trackId) {
        return;
    }

    // Обновляем только прогресс и время
    const progress = duration > 0 ? (position / duration) : 0;
    key.style.progress = progress;

    // Обновляем только время в заголовке
    const titleParts = key.title.split('\n');
    if (titleParts.length >= 3) {
        const currentTime = formatTime(position);
        const totalTime = formatTime(duration);
        titleParts[2] = `${currentTime} / ${totalTime}`;
        key.title = titleParts.join('\n');
    }

    // Рисуем обновленный ключ
    safeDraw(serialNumber, key, 'draw');
}

/**
 * Очистка всех интервалов
 */
function clearAllIntervals() {
    logger.info('Clearing all update intervals');
    for (const uid in updateIntervals) {
        clearInterval(updateIntervals[uid]);
        delete updateIntervals[uid];
    }
}

// Остальные обработчики событий...

/**
 * Called when a plugin key is loaded
 */
plugin.on('plugin.alive', (payload) => {
    logger.info('Plugin alive:', payload);

    connectedDevices.add(payload.serialNumber);

    for (let key of payload.keys) {
        logger.info('Processing key:', key.cid);
        // Убедимся, что key.data существует
        key.data = key.data || {};
        keyData[key.uid] = key;

        if (updateIntervals[key.uid]) {
            clearInterval(updateIntervals[key.uid]);
            delete updateIntervals[key.uid];
        }

        // Очищаем интервал обновления прогресса, если он существует
        if (updateIntervals[`${key.uid}_progress`]) {
            clearInterval(updateIntervals[`${key.uid}_progress`]);
            delete updateIntervals[`${key.uid}_progress`];
        }

        switch (key.cid) {
            case `${PLUGIN_UUID}.trackinfo`:
                logger.info('Setting up Track Info key');

                key.style = key.style || {};
                key.style.showTitle = true;
                key.style.foregroundOutline = false;
                key.title = 'Nothing playing';

                key.style.icon = 'mdi mdi-music';
                key.style.showIcon = true;

                safeDraw(payload.serialNumber, key, 'draw');

                // Полное обновление информации о треке (раз в 3 секунды)
                updateTrackInfo(payload.serialNumber, key);
                updateIntervals[key.uid] = setInterval(() => {
                    if (keyData[key.uid]) {
                        updateTrackInfo(payload.serialNumber, keyData[key.uid]);
                    } else {
                        logger.warn(`Key with uid ${key.uid} not found in keyData for interval update.`);
                        clearInterval(updateIntervals[key.uid]);
                        delete updateIntervals[key.uid];
                    }
                }, DEFAULT_SETTINGS.updateInterval);

                // Обновление только прогресса (раз в секунду)
                updateIntervals[`${key.uid}_progress`] = setInterval(() => {
                    if (keyData[key.uid]) {
                        updateProgressOnly(payload.serialNumber, keyData[key.uid]);
                    } else {
                        logger.warn(`Key with uid ${key.uid} not found in keyData for progress update.`);
                        clearInterval(updateIntervals[`${key.uid}_progress`]);
                        delete updateIntervals[`${key.uid}_progress`];
                    }
                }, 1000); // Обновляем прогресс каждую секунду
                break;

            // Остальные case для других ключей...
        }
    }
});

/**
 * Called when user interacts with a key
 */
plugin.on('plugin.data', async (payload) => {
    logger.info('Received plugin.data:', payload);
    const data = payload.data;
    // Получаем актуальный объект key из keyData
    const key = keyData[data.key.uid];

    if (!key) {
        logger.warn(`Key with uid ${data.key.uid} not found in keyData for plugin.data event.`);
        return;
    }

    if (!connectedDevices.has(payload.serialNumber)) {
        logger.warn(`Device ${payload.serialNumber} not connected, ignoring key press`);
        return;
    }

    if (key.cid === `${PLUGIN_UUID}.trackinfo`) {
        logger.info('Track Info key pressed');
        await togglePlayPause();
        // Обновляем информацию немедленно после действия
        await updateTrackInfo(payload.serialNumber, key);
        // Основной интервал для обновления всей информации о треке
        updateIntervals[key.uid] = setInterval(() => {
            if (keyData[key.uid]) {
                updateTrackInfo(payload.serialNumber, keyData[key.uid]);
            } else {
                logger.warn(`Key with uid ${key.uid} not found in keyData for interval update.`);
                clearInterval(updateIntervals[key.uid]);
                delete updateIntervals[key.uid];
            }
        }, DEFAULT_SETTINGS.updateInterval);

        // Дополнительный интервал для более частого обновления только позиции
        if (key.data.enableSmoothProgress !== false) {
            const progressUpdateInterval = key.data.progressUpdateInterval || 1000; // 1 секунда по умолчанию
            updateIntervals[`${key.uid}_progress`] = setInterval(async () => {
                if (keyData[key.uid]) {
                    const { position, duration, isPlaying } = await getPlaybackPosition();
                    if (isPlaying) {
                        // Обновляем только прогресс, не перерисовывая всю информацию
                        const progress = duration > 0 ? (position / duration) : 0;
                        keyData[key.uid].style.progress = progress;

                        // Форматируем время
                        const formatTime = (seconds) => {
                            const mins = Math.floor(seconds / 60);
                            const secs = Math.floor(seconds % 60);
                            return `${mins}:${secs.toString().padStart(2, '0')}`;
                        };

                        // Обновляем только время в заголовке
                        const currentTitle = keyData[key.uid].title;
                        const titleParts = currentTitle.split('\n');
                        if (titleParts.length >= 3) {
                            titleParts[2] = `${formatTime(position)} / ${formatTime(duration)}`;
                            keyData[key.uid].title = titleParts.join('\n');
                        }

                        safeDraw(payload.serialNumber, keyData[key.uid], 'draw');
                    }
                } else {
                    clearInterval(updateIntervals[`${key.uid}_progress`]);
                    delete updateIntervals[`${key.uid}_progress`];
                }
            }, progressUpdateInterval);
        }

    } else if (key.cid === `${PLUGIN_UUID}.playpause`) {
        logger.info('Play/Pause key pressed');
        await togglePlayPause();
        // Обновляем информацию на ключе Track Info
        for (const uid in keyData) {
            if (keyData[uid].cid === `${PLUGIN_UUID}.trackinfo`) {
                await updateTrackInfo(payload.serialNumber, keyData[uid]);
                break;
            }
        }

    } else if (key.cid === `${PLUGIN_UUID}.next`) {
        logger.info('Next Track key pressed');
        await nextTrack();
        // Находим ключ Track Info и обновляем его
        for (const uid in keyData) {
            if (keyData[uid].cid === `${PLUGIN_UUID}.trackinfo`) {
                await updateTrackInfo(payload.serialNumber, keyData[uid]);
                break;
            }
        }

    } else if (key.cid === `${PLUGIN_UUID}.previous`) {
        logger.info('Previous Track key pressed');
        await previousTrack();
        // Находим ключ Track Info и обновляем его
        for (const uid in keyData) {
            if (keyData[uid].cid === `${PLUGIN_UUID}.trackinfo`) {
                await updateTrackInfo(payload.serialNumber, keyData[uid]);
                break;
            }
        }
    }
});

/**
 * Called when plugin is stopped
 */
plugin.on('plugin.stop', () => {
    logger.info('Plugin stopping, clearing intervals');
    clearAllIntervals();
    connectedDevices.clear();
});

/**
 * Called when plugin is unloaded
 */
plugin.on('plugin.unload', () => {
    logger.info('Plugin unloading, clearing intervals');
    clearAllIntervals();
    connectedDevices.clear();
});

// Connect to flexdesigner and start the plugin
plugin.start();
