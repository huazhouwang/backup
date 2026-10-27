interface ImportMetaEnv {
  /** Short commit the app was built from, or `dev` for local builds. */
  readonly APP_BUILD: string
  /** When the app was built, in milliseconds since the epoch. */
  readonly APP_BUILT_AT: number
  /** The app's own address (from the deploy), or empty where it has none. */
  readonly APP_URL: string
}
