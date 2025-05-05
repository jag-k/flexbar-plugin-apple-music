import { logger } from "@eniac/flexdesigner"
import { updateIntervals } from "./consts"

/**
 * Sets an interval and stores its ID for later cleanup
 * @param {string} id - Unique identifier for the interval
 * @param {Function} callback - Function to be called at interval
 * @param {number} delay - Interval delay in milliseconds
 * @returns {void}
 */
export function setManagedInterval(id, callback, delay) {
  // Ignore already existing intervals
  if (updateIntervals[id]) {
    return
  }

  // Create a wrapped callback that handles errors
  const wrappedCallback = async (...args) => {
    try {
      await callback(...args)
    } catch (error) {
      logger.error(`Error in interval callback ${id}:`, error)
    }
  }

  updateIntervals[id] = setInterval(wrappedCallback, delay)
}

/**
 * Clears a managed interval
 * @param {string} id - Unique identifier for the interval
 * @returns {void}
 */
export function clearManagedInterval(id) {
  if (updateIntervals[id]) {
    clearInterval(updateIntervals[id])
    delete updateIntervals[id]
  }
}

/**
 * Clear intervals associated with a specific key
 * @param {string} keyUid - The key UID
 * @returns {void}
 */
export function clearKeyIntervals(keyUid) {
  clearManagedInterval(keyUid)
  clearManagedInterval(`${keyUid}_progress`)
}

/**
 * Clear all active intervals
 * @returns {void}
 */
export function clearAllIntervals() {
  logger.info("Clearing all update intervals")
  for (const uid in updateIntervals) {
    clearManagedInterval(uid)
  }
}
