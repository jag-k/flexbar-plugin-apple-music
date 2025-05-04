import { logger, plugin } from "@eniac/flexdesigner"
import { connectedDevices, keyData, PLUGIN_UUID, updateIntervals } from "./consts"
import {
  getPlaybackPosition,
  getTrackInfoWithAppleScript,
  nextTrack,
  previousTrack,
  togglePlayPause,
} from "./music_control"
import { getCachedTrackInfo } from "./cache"
import { ifDeviceConnected } from "./utils"
import { setManagedInterval, clearManagedInterval } from "./interval-utils"

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
 * @typedef {Object} KeyStyle
 * @property {string} [icon] - Key icon (either a Material Design icon name or a data URI)
 * @property {boolean} [showIcon] - Whether to show the icon
 * @property {boolean} [showTitle] - Whether to show the title
 * @property {boolean} [showProgress] - Whether to show progress bar
 * @property {number} [progress] - Progress value between 0 and 1
 * @property {string} [progressBarColor] - Color for the progress bar
 * @property {boolean} [foregroundOutline] - Whether to use foreground outline
 */

/**
 * @typedef {Object} KeyData
 * @property {boolean} [showProgress] - Whether to show progress bar
 * @property {string} [progressBarColor] - Custom progress bar color
 * @property {boolean} [enableSmoothProgress] - Whether to enable smooth progress updates
 * @property {number} [progressUpdateInterval] - Custom interval for progress updates
 */

/**
 * @typedef {Object} Key
 * @property {string} uid - Unique identifier for the key
 * @property {string} cid - Component identifier
 * @property {string} title - Key title text
 * @property {KeyStyle} style - Style properties for the key
 * @property {KeyData} data - Custom data for the key
 */

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
  logger.debug("Track info:", key.data)

  if (!trackInfo) {
    logger.error("Failed to get track info")
    newStyle.showIcon = true
    newStyle.showTitle = true
    newStyle.icon = "mdi mdi-music-off"
    newStyle.showProgress = false
  } else {
    if (trackInfo.title !== "No track is playing") {
      newStyle.showTitle = true

      // Add information about playback time
      // const currentTime = formatTime(trackInfo.position)
      // const totalTime = formatTime(trackInfo.duration)

      // Set text with track and time information
      newTitle = `${trackInfo.title}\n${trackInfo.artist}`

      // Configure progress bar
      if (key.data.showProgress !== false) {
        newStyle.progress = trackInfo.duration > 0 ? trackInfo.position / trackInfo.duration : 0
        newStyle.showProgress = true
        newStyle.progressBarColor = key.data.progressBarColor || "#1ED760" // Green color by default
      }

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

// Other event handlers...

/**
 * @typedef {Object} PluginAlivePayload
 * @property {string} serialNumber - Device serial number
 * @property {Array<Key>} keys - Array of keys available on the device
 */

/**
 * Called when a plugin key is loaded
 * @param {PluginAlivePayload} payload - Event payload with device information
 */
plugin.on("plugin.alive", async (payload) => {
  logger.info("Plugin alive:", payload)
  const { updateRate } = await plugin.getConfig()

  connectedDevices.add(payload.serialNumber)

  for (let key of payload.keys) {
    logger.info("Processing key:", key.cid)
    // Make sure key.data exists
    key.data = key.data || {}
    keyData[key.uid] = key

    if (updateIntervals[key.uid]) {
      clearInterval(updateIntervals[key.uid])
      delete updateIntervals[key.uid]
    }

    // Clear progress update interval if it exists
    if (updateIntervals[`${key.uid}_progress`]) {
      clearInterval(updateIntervals[`${key.uid}_progress`])
      delete updateIntervals[`${key.uid}_progress`]
    }

    switch (key.cid) {
      case `${PLUGIN_UUID}.trackinfo`:
        logger.info("Setting up Track Info key")
        const config = await plugin.getConfig()
        logger.debug("Config:", config)

        key.style = key.style || {}
        key.style.showTitle = true
        key.style.foregroundOutline = false
        key.title = "Nothing playing"

        key.style.icon = "mdi mdi-music"
        key.style.showIcon = true

        safeDraw(payload.serialNumber, key, "draw")

        // Full track information update
        logger.debug(`Setting up progress update interval every ${updateRate} ms`)
        await updateTrackInfo(payload.serialNumber, key)
        setManagedInterval(
          key.uid,
          async () => {
            if (keyData[key.uid]) {
              await updateTrackInfo(payload.serialNumber, keyData[key.uid])
            } else {
              logger.warn(`Key with uid ${key.uid} not found in keyData for interval update.`)
              clearManagedInterval(key.uid)
            }
          },
          updateRate
        )

        // Update-only progress
        updateIntervals[`${key.uid}_progress`] = setInterval(async () => {
          if (keyData[key.uid]) {
            await updateProgressOnly(payload.serialNumber, keyData[key.uid])
          } else {
            logger.warn(`Key with uid ${key.uid} not found in keyData for progress update.`)
            clearInterval(updateIntervals[`${key.uid}_progress`])
            delete updateIntervals[`${key.uid}_progress`]
          }
        }, 1000) // Update progresses every second
        break
    }
  }
})

/**
 * @typedef {Object} KeyPressData
 * @property {Key} key - The key that was pressed
 */

/**
 * @typedef {Object} PluginDataPayload
 * @property {string} serialNumber - Device serial number
 * @property {KeyPressData} data - Data about the key press
 */

/**
 * Called when user interacts with a key
 * @param {PluginDataPayload} payload - Event payload with key press information
 */
plugin.on("plugin.data", async (payload) => {
  logger.info("Received plugin.data:", payload)
  const data = payload.data
  // Get the current key object from keyData
  const key = keyData[data.key.uid]
  const { updateRate } = await plugin.getConfig()
  console.log(data)

  if (!key) {
    logger.warn(`Key with uid ${data.key.uid} not found in keyData for plugin.data event.`)
    return
  }

  if (!connectedDevices.has(payload.serialNumber)) {
    logger.warn(`Device ${payload.serialNumber} not connected, ignoring key press`)
    return
  }
  const config = await plugin.getConfig()
  logger.debug("Config:", config)
  if (key.cid === `${PLUGIN_UUID}.trackinfo`) {
    logger.info("Track Info key pressed")
    await togglePlayPause()
    // Update information immediately after action
    await updateTrackInfo(payload.serialNumber, key)
    // Main interval for updating all track information
    updateIntervals[key.uid] = setInterval(async () => {
      if (keyData[key.uid]) {
        await updateTrackInfo(payload.serialNumber, keyData[key.uid])
      } else {
        logger.warn(`Key with uid ${key.uid} not found in keyData for interval update.`)
        clearInterval(updateIntervals[key.uid])
        delete updateIntervals[key.uid]
      }
    }, updateRate)

    // Additional interval for more frequent position-only updates
    if (key.data.enableSmoothProgress !== false) {
      const progressUpdateInterval = key.data.progressUpdateInterval || 1000 // 1 second by default
      updateIntervals[`${key.uid}_progress`] = setInterval(async () => {
        if (keyData[key.uid]) {
          const { position, duration, isPlaying } = await getPlaybackPosition()
          if (isPlaying) {
            // Update only progress without redrawing all information
            keyData[key.uid].style.progress = duration > 0 ? position / duration : 0

            // Format time
            const formatTime = (seconds) => {
              const mins = Math.floor(seconds / 60)
              const secs = Math.floor(seconds % 60)
              return `${mins}:${secs.toString().padStart(2, "0")}`
            }

            // Update only time in the title
            const currentTitle = keyData[key.uid].title
            const titleParts = currentTitle.split("\n")
            if (titleParts.length >= 3) {
              titleParts[2] = `${formatTime(position)} / ${formatTime(duration)}`
              keyData[key.uid].title = titleParts.join("\n")
            }

            safeDraw(payload.serialNumber, keyData[key.uid], "draw")
          }
        } else {
          clearInterval(updateIntervals[`${key.uid}_progress`])
          delete updateIntervals[`${key.uid}_progress`]
        }
      }, progressUpdateInterval)
    }
  } else if (
    key.cid === `${PLUGIN_UUID}.playpause` ||
    key.cid === `${PLUGIN_UUID}.next` ||
    key.cid === `${PLUGIN_UUID}.previous`
  ) {
    // Execute the appropriate command based on a key pressed
    if (key.cid === `${PLUGIN_UUID}.playpause`) {
      logger.info("Play/Pause key pressed")
      await togglePlayPause()
    } else if (key.cid === `${PLUGIN_UUID}.next`) {
      logger.info("Next Track key pressed")
      await nextTrack()
    } else {
      logger.info("Previous Track key pressed")
      await previousTrack()
    }

    // Find and update the Track Info key
    await updateTrackInfoKey(payload.serialNumber)
  }
})

/**
 * Finds the Track Info key and updates it
 * @param {string} serialNumber - Device serial number
 * @returns {Promise<void>}
 */
async function updateTrackInfoKey(serialNumber) {
  for (const uid in keyData) {
    if (keyData[uid].cid === `${PLUGIN_UUID}.trackinfo`) {
      await updateTrackInfo(serialNumber, keyData[uid])
      break
    }
  }
}

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

plugin.on("ui.message", async (payload) => {
  logger.debug("Received message from UI:", payload)
  if (payload.data === "test") {
    await testAPIs()
    return "Done!"
  } else {
    return "Hello from plugin backend!"
  }
})

// Connect to the FlexDesigner and start the plugin
plugin.start()
