// electron-builder artifactBuildStarted hook.
//
// Runs before each artifact is built, after the app was packed and its Electron
// fuses were set. On Linux it applies the launcher wrapper that afterPack
// scheduled (see scripts/lib/linux-wrap.js for why it cannot run earlier).

const { wrapForArtifact } = require("./lib/linux-wrap");

exports.default = async function artifactBuildStarted(context) {
  const wrapped = wrapForArtifact(context);
  if (wrapped) console.log(`  artifactBuildStarted: wrapped the Linux launcher in ${wrapped}`);
};
