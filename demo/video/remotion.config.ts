import { Config } from "@remotion/cli/config";

// Render with the Chrome already on this Mac rather than downloading one.
Config.setBrowserExecutable("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
// Lossless frames into one encode. JPEG frames were compressed twice, and
// ffmpeg tagged their output full-range (yuvj420p), which some players show
// with washed-out or crushed tones.
Config.setVideoImageFormat("png");
Config.setCodec("h264");
Config.setPixelFormat("yuv420p");
Config.setColorSpace("bt709");
// Near-transparent quality: a UI film is mostly still pixels and fine text.
Config.setCrf(12);
Config.setConcurrency(4);
