import { Config } from "@remotion/cli/config";

// Render with the Chrome already on this Mac rather than downloading one.
Config.setBrowserExecutable("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setConcurrency(4);
