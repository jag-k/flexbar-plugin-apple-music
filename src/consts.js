import path from "path"

import { pluginPath } from "@eniac/flexdesigner"

const { uuid } = require(`${pluginPath}/manifest.json`)

/**
 * The UUID of the plugin from the manifest.json file
 * @type {string}
 */
export const PLUGIN_UUID = uuid

/**
 * Temporary directory for storing files
 * @type {string}
 */
export const TMP_DIR = require("os").tmpdir()

/**
 * Path to the temporary artwork file
 * @type {string}
 */
export const ARTWORK_PATH = path.join(TMP_DIR, "artwork_temp.bin")

/**
 * Store interval IDs for each key to avoid multiple intervals
 * @type {Object.<string, number>}
 */
export const updateIntervals = {}

/**
 * Store the connected devices by serial number
 * @type {Set<string>}
 */
export const connectedDevices = new Set()
