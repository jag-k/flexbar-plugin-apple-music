import path from "path";

import { pluginPath } from "@eniac/flexdesigner";

const { uuid } = require(`${pluginPath}/manifest.json`);
export const PLUGIN_UUID = uuid;

// Настройки по умолчанию
export const DEFAULT_SETTINGS = {
    updateInterval: 3000,
};
export const TMP_DIR = require("os").tmpdir();
export const ARTWORK_PATH = path.join(TMP_DIR, "artwork_temp.bin");
// Store key data
export const keyData = {};
// Store interval IDs for each key to avoid multiple intervals
export const updateIntervals = {};
// Store connected devices
export const connectedDevices = new Set();

