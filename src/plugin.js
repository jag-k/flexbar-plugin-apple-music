import { logger, plugin } from "@eniac/flexdesigner"
import { connectedDevices, PLUGIN_UUID, updateIntervals } from "./consts"
import {
  getPlaybackPosition,
  getTrackInfoWithAppleScript,
  nextTrack,
  previousTrack,
  togglePlayPause,
} from "./musicControl"
import { getCachedTrackInfo } from "./cache"
import { ifDeviceConnected } from "./utils"
import { clearManagedInterval, setManagedInterval } from "./intervalUtils"

/**
 * Formats time in MM:SS format
 * @param {number} seconds - Time in seconds to format
 * @returns {string} Formatted time string in MM:SS format
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

/**
 * Safe drawing on the device with a connection check
 * @param {string} serialNumber - Device serial number
 * @param {Key} key - Key object to draw
 * @param {string} type - Draw type ('draw', 'clear', etc.)
 * @returns {void}
 */
function safeDraw(serialNumber, key, type) {
  ifDeviceConnected(serialNumber, connectedDevices, () => {
    try {
      // Create a new object with only the necessary properties
      const keyToDraw = {
        uid: key.uid,
        cid: key.cid,
        title: key.title,
        style: { ...key.style },
        data: { ...key.data },
      }

      plugin.draw(serialNumber, keyToDraw, type).catch(() => {})
    } catch (error) {
      logger.error(`Error drawing to device ${serialNumber}:`, error)
    }
  })
}

/**
 * Complete updating of the track data on the key (called every 3 seconds)
 * @param {string} serialNumber - Device serial number
 * @param {Key} key - Key object to update
 * @returns {Promise<void>}
 */
async function updateTrackInfo(serialNumber, key) {
  if (!connectedDevices.has(serialNumber)) {
    logger.warn(`Device ${serialNumber} not connected, skipping track info update`)
    return
  }

  logger.info("Updating full track info for key:", key.cid)
  const trackInfo = await getTrackInfoWithAppleScript()

  // Create a copy of styles for modification
  let newStyle = { ...key.style }
  let newTitle = "No track info"

  if (!trackInfo) {
    logger.error("Failed to get track info")
    newStyle.showIcon = true
    newStyle.showTitle = true
    newStyle.icon = "mdi mdi-music-off"
    newStyle.showProgress = false
  } else {
    if (trackInfo.title !== "No track is playing") {
      newStyle.showTitle = true

      // Set text with track and time information
      newTitle = `${trackInfo.title}\n${trackInfo.artist}`

      // Configure progress bar
      // if (key.data.showProgress !== false) {
      //   newStyle.progress = trackInfo.duration > 0 ? trackInfo.position / trackInfo.duration : 0
      //   newStyle.showProgress = true
      //   newStyle.progressBarColor = key.data.progressBarColor || "#1ED760" // Green color by default
      // }

      // Always show artwork if available
      if (trackInfo.artwork && trackInfo.artwork.startsWith("data:image")) {
        logger.info("Setting artwork icon")
        newStyle.showIcon = key.data.showArtwork !== false
        newStyle.icon = trackInfo.artwork
      } else {
        logger.info("Using default music icon")
        newStyle.showIcon = true
        newStyle.icon = "mdi mdi-music"
      }
      logger.info("Updated track info:", newTitle)
    } else {
      logger.info("No track playing")
      newStyle.showIcon = true
      newStyle.showTitle = true
      newStyle.icon = "mdi mdi-music-off"
      newTitle = "No track playing"
      newStyle.showProgress = false
    }
  }

  key.style = newStyle
  key.title = newTitle

  safeDraw(serialNumber, key, "draw")
}

/**
 * @param {string} serialNumber - Device serial number
 * @param {Key} key - Key object to update
 * @returns {Promise<ResponseStatus>}
 */
async function updatePlayPauseButton(serialNumber, key) {
  if (!connectedDevices.has(serialNumber)) {
    logger.warn(`Device ${serialNumber} not connected, skipping track info update`)
    return { status: "error", message: "Device not connected" }
  }

  const trackInfo = await getTrackInfoWithAppleScript()
  if (trackInfo) {
    const { isPlaying, isRunning } = trackInfo

    // If not running: 0 state
    // If paused: 1 state
    // If playing: 2 state
    const state = isRunning ? (isPlaying ? 2 : 1) : 0
    await plugin.set(serialNumber, key, { state })
    return {
      status: "success",
    }
  } else {
    await plugin.set(serialNumber, key, {
      state: 0,
    })
    return {
      status: "error",
      message: "Failed to get track info",
    }
  }
}

/**
 * Update only playback progress (called more frequently, once per second)
 * @param {string} serialNumber - Device serial number
 * @param {Key} key - Key object to update
 * @returns {Promise<void>}
 */
async function updateProgressOnly(serialNumber, key) {
  if (!connectedDevices.has(serialNumber)) {
    return
  }

  // Get only playback position (lightweight request)
  const { position, duration, isPlaying } = await getPlaybackPosition()

  // If the track is not playing, don't update progress
  if (!isPlaying) {
    return
  }

  // Get current track information from a cache
  const cachedInfo = getCachedTrackInfo()

  // If there's no track information in the cache, don't update progress
  if (!cachedInfo.trackId) {
    return
  }

  // Update only progress and time
  key.style.progress = duration > 0 ? position / duration : 0

  // Update only time in the title
  const titleParts = key.title.split("\n")
  if (titleParts.length >= 3) {
    const currentTime = formatTime(position)
    const totalTime = formatTime(duration)
    titleParts[2] = `${currentTime} / ${totalTime}`
    key.title = titleParts.join("\n")
  }

  // Draw the updated key
  safeDraw(serialNumber, key, "draw")
}

/**
 * Clear all active intervals
 * @returns {void}
 */
function clearAllIntervals() {
  logger.info("Clearing all update intervals")
  for (const uid in updateIntervals) {
    clearManagedInterval(uid)
  }
}

/**
 * Retrieves the component identifier (CID) derived from a key object using its unique identifier (UID)
 * and validates whether the provided serial number corresponds to a connected device.
 *
 * @param {Key} key - Key object to extract the CID from.
 * @param {string} serialNumber - The serial number of the device to validate against connected devices.
 * @return {string|undefined} The extracted CID if valid, or undefined if the key does not exist,
 * the device is not connected, or the CID does not match the expected format.
 */
function getCid(key, serialNumber) {
  const keyUid = key.uid

  if (!key || !keyUid || !key.cid) {
    logger.warn(`Key with uid ${keyUid} not found in keyData for plugin.data event.`)
    return
  }
  if (!connectedDevices.has(serialNumber)) {
    logger.warn(`Device ${serialNumber} not connected, ignoring key press`)
    return
  }
  if (!key.cid.startsWith(`${PLUGIN_UUID}.`)) {
    return
  }

  return key.cid.slice(`${PLUGIN_UUID}.`.length)
}

/**
 * Called when a plugin key is loaded
 * @param {PluginAlivePayload} payload - Event payload with device information
 * @returns {Promise<void>}
 */
plugin.on("plugin.alive", async ({ serialNumber, keys }) => {
  const { updateRate } = await plugin.getConfig()

  connectedDevices.add(serialNumber)

  for (let key of keys) {
    logger.info("Processing key:", key.cid)
    // Make sure key.data exists
    key.data = key.data || {}
    const keyUid = key.uid

    if (updateIntervals[keyUid]) {
      clearManagedInterval(keyUid)
    }

    const cid = getCid(key, serialNumber)
    if (!cid) {
      continue
    }

    switch (cid) {
      case "trackInfo": {
        logger.info("Setting up Track Info key")

        // Full track information update
        logger.debug(`Setting up progress update interval every ${updateRate} ms`)
        await updateTrackInfo(serialNumber, key)
        setManagedInterval(
          key.uid,
          async () => {
            await updateTrackInfo(serialNumber, key)
          },
          updateRate
        )
        break
      }
      case "playPause": {
        logger.info("Setting up Play/Pause key")
        await updatePlayPauseButton(serialNumber, key)
        setManagedInterval(
          keyUid,
          async () => {
            await updatePlayPauseButton(serialNumber, key)
          },
          updateRate
        )
        break
      }
    }
  }
})

/**
 * Called when user interacts with a key
 * @param {PluginDataPayload} payload - Event payload with key press information
 * @returns {Promise<ResponseStatus | void>}
 */
plugin.on("plugin.data", async ({ data, serialNumber }) => {
  // Get the current key object from keyData
  const { key } = data
  const cid = getCid(key, serialNumber)

  switch (cid) {
    case "trackInfo": {
      logger.info("Track Info key pressed")
      await togglePlayPause()
      await updateTrackInfo(serialNumber, key)
      return
    }
    case "playPause": {
      logger.info("Play/Pause key pressed")
      await togglePlayPause()
      return await updatePlayPauseButton(serialNumber, key)
    }
    case "next": {
      logger.info("Next Track key pressed")
      await nextTrack()
      return
    }
    case "previous": {
      logger.info("Previous Track key pressed")
      await previousTrack()
      return
    }
    default: {
      logger.warn(`Unknown CID: ${cid}`)
      return
    }
  }
})

/**
 * Called when plugin is stopped
 * @returns {void}
 */
plugin.on("plugin.stop", () => {
  logger.info("Plugin stopping, clearing intervals")
  clearAllIntervals()
  connectedDevices.clear()
})

/**
 * Called when plugin is unloaded
 * @returns {void}
 */
plugin.on("plugin.unload", () => {
  logger.info("Plugin unloading, clearing intervals")
  clearAllIntervals()
  connectedDevices.clear()
})

// Connect to the FlexDesigner and start the plugin
plugin.start()
