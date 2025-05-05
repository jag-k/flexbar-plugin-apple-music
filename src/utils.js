import util from "util"
import { exec } from "child_process"
import { logger } from "@eniac/flexdesigner"
import { clearTrackCache } from "./cache"

// noinspection JSValidateTypes
/**
 * Promisified version of the exec function for executing shell commands
 * @type {function(string): Promise<{stdout: string, stderr: string}>}
 */
const execPromise = util.promisify(exec)

/**
 * Executes an AppleScript command and returns the resulting output.
 *
 * @param {string} code - The AppleScript code to be executed.
 * @return {Promise<string>} A promise that resolves with the standard output (stdout) of the executed AppleScript command.
 * @throws {Error} If the AppleScript execution fails.
 */
export async function runAppleScript(code) {
  const { stdout } = await execPromise(`osascript -e '${code.trim()}'`)
  return stdout.trim()
}

/**
 * Safely executes a function and logs any errors
 * @template T
 * @param {() => Promise<T>} fn - The async function to execute
 * @param {T} defaultValue - The default value to return if the function fails
 * @param {string} errorMessage - The error message prefix to log
 * @returns {Promise<T>} The result of the function or the default value
 */
export async function safeExecute(fn, defaultValue, errorMessage) {
  try {
    return await fn()
  } catch (error) {
    logger.error(`${errorMessage}:`, error)
    return defaultValue
  }
}

/**
 * Checks if a device is connected before performing an operation
 * @param {string} serialNumber - The device serial number
 * @param {Set<string>} connectedDevices - Set of connected device serial numbers
 * @param {Function} fn - The function to execute if connected
 * @returns {any} The result of the function or undefined if not connected
 */
export function ifDeviceConnected(serialNumber, connectedDevices, fn) {
  if (connectedDevices.has(serialNumber)) {
    return fn()
  } else {
    logger.warn(`Device ${serialNumber} not connected, operation skipped`)
    return undefined
  }
}

/**
 * Executes a simple Apple Music command and clears the track cache
 * @param {string} command - The AppleScript command to execute
 * @param {string} errorMessage - Error message to log if command fails
 * @returns {Promise<boolean>} True if successful, false if error occurred
 */
export async function executeAppleMusicCommand(command, errorMessage) {
  return safeExecute(
    async () => {
      await runAppleScript(command)
      clearTrackCache()
      return true
    },
    false,
    errorMessage
  )
}
