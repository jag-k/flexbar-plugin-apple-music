import fs from "fs/promises"
import { ARTWORK_PATH } from "./consts"
import { logger } from "@eniac/flexdesigner"
import { getCachedTrackInfo, isCacheValid, updatePositionInCache, updateTrackCache } from "./cache"
import { executeAppleMusicCommand, runAppleScript } from "./utils"

/**
 * Checks if Apple Music application is currently running
 * @returns {Promise<boolean>} True if Apple Music is running, false otherwise
 */
async function isAppleMusicRunning() {
  const checkRunningScript = `
    tell application "System Events"
        set isRunning to (exists (processes where name is "Music"))
        return isRunning
    end tell`

  try {
    const isRunning = (await runAppleScript(checkRunningScript)) === "true"
    logger.debug("Apple Music is running:", isRunning)
    return isRunning
  } catch (e) {
    logger.error(e)
    return false
  }
}

/**
 * Retrieves the current track ID and playback information from Apple Music
 * @returns {Promise<TrackIdInfo>} Basic information about the current track
 */
async function getCurrentTrackId() {
  const defaultResponse = {
    trackId: null,
    position: 0,
    duration: 0,
    isPlaying: false,
    isRunning: false,
  }
  const isRunning = await isAppleMusicRunning()
  if (!isRunning) {
    return defaultResponse
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
        end tell`

    const [trackId, position, duration, isPlaying] = (await runAppleScript(script)).split("\n")
    return {
      trackId,
      position: parseFloat(position),
      duration: parseFloat(duration),
      isPlaying: isPlaying === "true",
      isRunning: true,
    }
  } catch (error) {
    logger.error("Error when receiving ID track:", error)
    return defaultResponse
  }
}

/**
 * Retrieves only playback position information (for updating progress)
 * Lightweight request that doesn't fetch artwork or other detailed data
 * @returns {Promise<PlaybackPosition>} Current playback position information
 */
export async function getPlaybackPosition() {
  const defaultResponse = { position: 0, duration: 0, isPlaying: false, isRunning: false }
  const isRunning = await isAppleMusicRunning()
  if (!isRunning) {
    return defaultResponse
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
        end tell`

    const [position, duration, isPlaying] = (await runAppleScript(script)).split("\n")

    // Update position in cache
    updatePositionInCache(parseFloat(position), isPlaying === "true")

    return {
      position: parseFloat(position),
      duration: parseFloat(duration),
      isPlaying: isPlaying === "true",
      isRunning: true,
    }
  } catch (error) {
    logger.error("Error in obtaining a playback position:", error)
    return defaultResponse
  }
}

/**
 * Retrieves current track data from Apple Music with cache support
 * @returns {Promise<TrackInfo|null>} Complete track information or null if error occurs
 */
export async function getTrackInfoWithAppleScript() {
  try {
    // First, retrieve just the track ID and playback position
    const { trackId, position, duration, isPlaying, isRunning } = await getCurrentTrackId()

    // If no track is playing, return standard information
    if (trackId === "no_track" || !isPlaying || !isRunning) {
      return {
        title: "No track is playing",
        artist: "",
        album: "",
        artwork: "No artwork available",
        position: 0,
        duration: 0,
        isPlaying,
        isRunning,
      }
    }

    // Check the cache - if track ID hasn't changed and cache is still valid,
    // use cached data but update the playback position
    const cachedInfo = getCachedTrackInfo()
    if (trackId === cachedInfo.trackId && isCacheValid()) {
      logger.info("Using cached track info for:", trackId)
      return {
        ...cachedInfo,
        position,
        duration,
        isPlaying,
        isRunning,
      }
    }

    // If cache is invalid or track ID has changed, fetch complete track information
    logger.info("Fetching new track info for:", trackId)

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
        end tell`

    const [title, artist, album, status] = (await runAppleScript(script)).split("\n")

    let artworkBase64
    if (status.includes("Artwork saved")) {
      try {
        const fileData = await fs.readFile(ARTWORK_PATH)
        artworkBase64 = `data:image/jpeg;base64,${fileData.toString("base64")}`
        await fs.unlink(ARTWORK_PATH).catch((err) => {
          logger.error("Error deleting temporary file:", err)
        })
      } catch (fileError) {
        logger.error("Error reading artwork file:", fileError)
        artworkBase64 = "Error reading artwork file"
      }
    } else {
      artworkBase64 = "No artwork available"
    }

    const trackInfo = {
      title,
      artist,
      album,
      artwork: artworkBase64,
      position,
      duration,
      isPlaying,
      isRunning,
    }

    // Update cache
    updateTrackCache(trackInfo, trackId)

    return trackInfo
  } catch (error) {
    logger.error("Error getting track data:", error)
    return null
  }
}

/**
 * Apple Music Control Play/Pause
 * @returns {Promise<boolean>} True if command was successful, false otherwise
 */
export async function togglePlayPause() {
  return executeAppleMusicCommand(`tell application "Music" to playpause`, "Error toggling playback")
}

/**
 * Skips to the next track in Apple Music
 * @returns {Promise<boolean>} True if command was successful, false otherwise
 */
export async function nextTrack() {
  return executeAppleMusicCommand(`tell application "Music" to next track`, "Error switching to next track")
}

/**
 * Returns to the previous track in Apple Music
 * @returns {Promise<boolean>} True if command was successful, false otherwise
 */
export async function previousTrack() {
  return executeAppleMusicCommand(`tell application "Music" to previous track`, "Error switching to previous track")
}

/**
 * Sets the current playback position in Apple Music.
 *
 * @param {number} position The position in seconds to set the playback to
 * @returns {Promise<boolean>} True if successful, false if there was an error
 */
export async function setPlaybackPosition(position) {
  return executeAppleMusicCommand(
    `tell application "Music" to set player position to ${position}`,
    "Error setting playback position"
  )
}
