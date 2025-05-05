export interface KeyStyle {
  icon?: string // Key icon (either a Material Design icon name or a data URI)
  emoji?: string // Emoji for the key
  width?: number // Width of the key
  bgColor?: string // Background color
  fgColor?: string // Foreground color
  borderStyle?: "none" | "solid" | "dotted" | "double" | "3d" // Border style
  borderWidth?: number // Border width
  borderColor?: string // Border color
  font?: string // Font for the key title
  fontSize?: number // Font size for the key title
  iconSize?: number // Icon size
  iconPos?: { X: number; Y: number } // Icon position in percentages
  titlePos?: { X: number; Y: number } // Title position in percentages
  titleRotate?: number // Rotation angle for the title
  iconRotate?: number // Rotation angle for the icon
  foregroundOutline?: boolean // Whether to add a shadow to the icon and title
  showIcon?: boolean // Whether to display the icon
  showEmoji?: boolean // Whether to display an emoji
  showTitle?: boolean // Whether to display the title
  showImage?: boolean // Whether to display an image
  image?: string // Base64-encoded PNG background image
}

export interface KeyData {
  showArtwork?: boolean // Need to show artwork or not
}

export interface Key {
  uid: string // Unique identifier for the key
  cid: string // Component identifier
  title: string // Key title text
  cfg: Object // Configuration for the key
  style: KeyStyle // Style properties for the key
  data: KeyData // Custom data for the key
}

export interface PluginAlivePayload {
  serialNumber: string // Device serial number
  keys: Array<Key> // Array of keys available on the device
}

export interface KeyPressData {
  key: Key // The key that was pressed
}

export interface PluginDataPayload {
  serialNumber: string // Device serial number
  data: KeyPressData // Data about the key press
}

export interface TrackIdInfo {
  trackId: string | null // Unique identifier for the track
  position: number // Current playback position in seconds
  duration: number // Total track duration in seconds
  isPlaying: boolean // Whether the track is currently playing
  isRunning: boolean // Whether the Apple Music application is running
}

export interface PlaybackPosition {
  position: number // Current playback position in seconds
  duration: number // Total track duration in seconds
  isPlaying: boolean // Whether the track is currently playing
  isRunning: boolean // Whether the Apple Music application is running
}

export interface TrackInfo {
  title: string // Title of the track
  artist: string // Artist name
  album: string // Album name
  artwork: string // Base64 encoded artwork data URI or status message
  position: number // Current playback position in seconds
  duration: number // Total track duration in seconds
  isPlaying: boolean // Whether the track is currently playing
  isRunning: boolean // Whether the Apple Music application is running
}

export interface ResponseStatus {
  status: "success" | "error"
  message?: string
}
