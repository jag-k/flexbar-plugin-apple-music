import fs from "fs/promises";
import util from "util";
import {exec} from "child_process";
import {ARTWORK_PATH} from "./consts";
import {logger} from "@eniac/flexdesigner";
import {getCachedTrackInfo, updateTrackCache, isCacheValid, clearTrackCache, updatePositionInCache} from "./cache";

const execPromise = util.promisify(exec);

async function isAppleMusicRunning() {
    const checkRunningScript = `
    tell application "System Events"
        set isRunning to (exists (processes where name is "Music"))
        return isRunning
    end tell
    `;

    try {
        const {stdout: isRunningOutput} = await execPromise(`osascript -e '${checkRunningScript}'`);
        const isRunning = isRunningOutput.trim() === "true";
        logger.info("Apple Music is running:", isRunning);
        return isRunning;
    } catch (e) {
        logger.error(e)
        return false;
    }

}

/**
 * Получение ID текущего трека и информации о воспроизведении из Apple Music
 */
async function getCurrentTrackId() {
    const defaultResponse = {trackId: null, position: 0, duration: 0, isPlaying: false}
    const isRunning = await isAppleMusicRunning();
    if (!isRunning) {
        return defaultResponse;
    }
    try {
        const script = `
        tell application "Music"
            if player state is playing then
                set currentTrack to current track
                set trackId to id of currentTrack as string
                set playerPosition to player position
                set trackDuration to duration of currentTrack
                set isPlaying to (player state is playing)
                return trackId & "\n" & playerPosition & "\n" & trackDuration & "\n" & isPlaying
            else
                return "no_track\n0\n0\nfalse"
            end if
        end tell
        `;

        const {stdout} = await execPromise(`osascript -e '${script}'`);
        const [trackId, position, duration, isPlaying] = stdout.trim().split("\n");
        return {
            trackId,
            position: parseFloat(position),
            duration: parseFloat(duration),
            isPlaying: isPlaying === "true"
        };
    } catch (error) {
        logger.error("Ошибка при получении ID трека:", error);
        return defaultResponse;
    }
}

/**
 * Получение только информации о позиции воспроизведения (для обновления прогресса)
 * Легкий запрос, который не загружает обложку и другие данные
 */
export async function getPlaybackPosition() {
    const defaultResponse = {position: 0, duration: 0, isPlaying: false}
    const isRunning = await isAppleMusicRunning();
    if (!isRunning) {
        return defaultResponse;
    }
    try {
        const script = `
        tell application "Music"
            set isPlaying to (player state is playing)
            if isPlaying then
                set playerPosition to player position
                set currentTrack to current track
                set trackDuration to duration of currentTrack
                return playerPosition & "\n" & trackDuration & "\ntrue"
            else
                return "0\n0\nfalse"
            end if
        end tell
        `;

        const {stdout} = await execPromise(`osascript -e '${script}'`);
        const [position, duration, isPlaying] = stdout.trim().split("\n");

        // Обновляем позицию в кеше
        updatePositionInCache(parseFloat(position), isPlaying === "true");

        return {
            position: parseFloat(position),
            duration: parseFloat(duration),
            isPlaying: isPlaying === "true"
        };
    } catch (error) {
        logger.error("Ошибка при получении позиции воспроизведения:", error);
        return defaultResponse;
    }
}

/**
 * Получение данных о текущем треке из Apple Music с использованием кеша
 */
export async function getTrackInfoWithAppleScript() {
    try {
        // Сначала получаем только ID трека и позицию воспроизведения
        const {trackId, position, duration, isPlaying} = await getCurrentTrackId();

        // Если трек не играет, возвращаем стандартную информацию
        if (trackId === "no_track" || !isPlaying) {
            return {
                title: "No track is playing",
                artist: "",
                album: "",
                artwork: "No artwork available",
                position: 0,
                duration: 0,
                isPlaying: false
            };
        }

        // Проверяем кеш - если ID трека не изменился и кеш валиден, используем его
        // но обновляем позицию воспроизведения
        const cachedInfo = getCachedTrackInfo();
        if (trackId === cachedInfo.trackId && isCacheValid()) {
            logger.info("Using cached track info for:", trackId);
            return {
                ...cachedInfo,
                position: position,
                duration: duration,
                isPlaying: isPlaying
            };
        }

        // Если кеш не валиден или ID изменился, получаем полную информацию о треке
        logger.info("Fetching new track info for:", trackId);

        const script = `
        tell application "Music"
            if player state is playing then
                set currentTrack to current track
                set trackName to name of currentTrack
                set trackArtist to artist of currentTrack
                set trackAlbum to album of currentTrack
                try
                    set trackArtwork to data of artwork 1 of currentTrack
                    set filePath to POSIX file "${ARTWORK_PATH}"
                    set fileRef to open for access file filePath with write permission
                    write trackArtwork to fileRef
                    close access fileRef
                    return trackName & "\n" & trackArtist & "\n" & trackAlbum & "\nArtwork saved"
                on error errMsg
                    return trackName & "\n" & trackArtist & "\n" & trackAlbum & "\nError: " & errMsg
                end try
            else
                return "No track is playing\n\n\nNo track"
            end if
        end tell
        `;

        const {stdout} = await execPromise(`osascript -e '${script}'`);
        const [title, artist, album, status] = stdout.trim().split("\n");

        let artworkBase64 = "";
        if (status.includes("Artwork saved")) {
            try {
                const fileData = await fs.readFile(ARTWORK_PATH);
                artworkBase64 = `data:image/jpeg;base64,${fileData.toString("base64")}`;
                await fs.unlink(ARTWORK_PATH).catch((err) => {
                    logger.error("Ошибка при удалении временного файла:", err);
                });
            } catch (fileError) {
                logger.error("Ошибка при чтении файла обложки:", fileError);
                artworkBase64 = "Error reading artwork file";
            }
        } else {
            artworkBase64 = "No artwork available";
        }

        const trackInfo = {
            title: title,
            artist: artist,
            album: album,
            artwork: artworkBase64,
            position: position,
            duration: duration,
            isPlaying: isPlaying
        };

        // Обновляем кеш
        updateTrackCache(trackInfo, trackId);

        return trackInfo;
    } catch (error) {
        logger.error("Ошибка при получении данных трека:", error);
        return null;
    }
}

/**
 * Элементы управления Apple Music
 */
export async function togglePlayPause() {
    try {
        await execPromise('osascript -e \'tell application "Music" to playpause\'');
        clearTrackCache();
        return true;
    } catch (error) {
        logger.error("Ошибка при переключении воспроизведения:", error);
        return false;
    }
}

export async function nextTrack() {
    try {
        await execPromise('osascript -e \'tell application "Music" to next track\'');
        clearTrackCache();
        return true;
    } catch (error) {
        logger.error("Ошибка при переключении на следующий трек:", error);
        return false;
    }
}

export async function previousTrack() {
    try {
        await execPromise('osascript -e \'tell application "Music" to previous track\'');
        clearTrackCache();
        return true;
    } catch (error) {
        logger.error("Ошибка при переключении на предыдущий трек:", error);
        return false;
    }
}

/**
 * Установка позиции воспроизведения
 */
export async function setPlaybackPosition(position) {
    try {
        await execPromise(`osascript -e 'tell application "Music" to set player position to ${position}'`);
        return true;
    } catch (error) {
        logger.error("Ошибка при установке позиции воспроизведения:", error);
        return false;
    }
}
