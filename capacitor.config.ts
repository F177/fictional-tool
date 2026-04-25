import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId  : "com.thepdf.app",
  appName: "ThePDF",
  webDir : "out",
  server : {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration   : 1800,
      launchAutoHide       : true,
      backgroundColor      : "#ffffff",
      androidSplashResourceName: "splash",
      showSpinner          : false,
    },
  },
  android: {
    buildOptions: {
      releaseType: "APK",
    },
  },
};

export default config;
