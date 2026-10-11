import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // Development identity; replace before signing a store release.
  appId: 'app.toss.mobile',
  appName: 'Toss',
  webDir: 'mobile/dist',
  android: {
    path: 'mobile/android',
  },
  ios: {
    path: 'mobile/ios',
  },
}

export default config
