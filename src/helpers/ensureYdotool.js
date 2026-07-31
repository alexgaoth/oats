const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { dialog } = require("electron");

const execFileAsync = promisify(execFile);
const STATUS_COMMAND_TIMEOUT_MS = 750;

function getLogger() {
  return require("./debugLogger");
}

function serviceFileExists() {
  const paths = [
    "/usr/lib/systemd/user/ydotoold.service",
    "/usr/lib/systemd/user/ydotool.service",
    `${os.homedir()}/.config/systemd/user/ydotoold.service`,
  ];
  return paths.some((p) => fs.existsSync(p));
}

function isUinputAccessible() {
  try {
    fs.accessSync("/dev/uinput", fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function commandExistsAsync(name) {
  try {
    await execFileAsync("which", [name], { timeout: STATUS_COMMAND_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

async function isYdotooldRunningAsync() {
  for (const service of ["ydotoold", "ydotool"]) {
    try {
      const { stdout } = await execFileAsync("systemctl", ["--user", "is-active", service], {
        timeout: STATUS_COMMAND_TIMEOUT_MS,
      });
      if (stdout.trim() === "active") return true;
    } catch {}
  }

  try {
    await execFileAsync("pgrep", ["-x", "ydotoold"], { timeout: STATUS_COMMAND_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

async function udevRuleExistsAsync() {
  const ruleDirs = ["/etc/udev/rules.d", "/usr/lib/udev/rules.d", "/lib/udev/rules.d"];
  for (const dir of ruleDirs) {
    try {
      const files = await fs.promises.readdir(dir);
      const rules = await Promise.all(
        files
          .filter((file) => file.endsWith(".rules"))
          .map(async (file) => {
            try {
              return await fs.promises.readFile(`${dir}/${file}`, "utf-8");
            } catch {
              return "";
            }
          })
      );
      if (rules.some((content) => content.includes("uinput"))) return true;
    } catch {}
  }
  return false;
}

async function userInInputGroupAsync() {
  try {
    const { stdout } = await execFileAsync("groups", [], { timeout: STATUS_COMMAND_TIMEOUT_MS });
    return stdout.includes("input");
  } catch {
    return false;
  }
}

async function isNixOSAsync() {
  try {
    if (
      await fs.promises
        .access("/etc/NIXOS")
        .then(() => true)
        .catch(() => false)
    ) {
      return true;
    }
    const osRelease = await fs.promises.readFile("/etc/os-release", "utf8");
    return /^ID=("?)nixos\1$/m.test(osRelease);
  } catch {
    return false;
  }
}

async function ensureYdotool() {
  if (process.platform !== "linux") return;

  const sessionType = (process.env.XDG_SESSION_TYPE || "").toLowerCase();
  if (sessionType !== "wayland" && !process.env.WAYLAND_DISPLAY) return;

  const log = getLogger();

  const { hasYdotool, hasYdotoold, daemonRunning, hasService, hasUinput, hasGroup } =
    await getYdotoolStatus();

  log.debug(
    "ydotool check",
    { hasYdotool, hasYdotoold, daemonRunning, hasService, hasUinput, hasGroup },
    "clipboard"
  );

  // Everything is fine
  if (hasYdotool && hasYdotoold && daemonRunning && hasUinput) {
    log.debug("ydotool fully configured", {}, "clipboard");
    return;
  }

  // If the service exists and daemon is just not running, try to start it
  if (hasYdotoold && hasService && !daemonRunning) {
    try {
      await execFileAsync("systemctl", ["--user", "start", "ydotoold"], { timeout: 10000 });
      if (await isYdotooldRunningAsync()) {
        log.info("ydotoold daemon started", {}, "clipboard");
        return;
      }
    } catch {}
    try {
      await execFileAsync("systemctl", ["--user", "start", "ydotool"], { timeout: 10000 });
      if (await isYdotooldRunningAsync()) {
        log.info("ydotool daemon started", {}, "clipboard");
        return;
      }
    } catch {}
  }

  // Something is missing — build an informative message
  const missing = [];

  if (!hasYdotool) {
    missing.push("- ydotool is not installed. Install it with your package manager.");
  }
  if (!hasYdotoold) {
    missing.push(
      "- ydotoold (daemon) is not installed. On Ubuntu/Pop!_OS: sudo apt install ydotoold. On Arch: included in the ydotool package."
    );
  }
  if (!hasUinput) {
    missing.push(
      '- /dev/uinput is not accessible. Add a udev rule:\n  echo \'KERNEL=="uinput", GROUP="input", MODE="0660", TAG+="uaccess"\' | sudo tee /etc/udev/rules.d/70-uinput.rules\n  sudo udevadm control --reload-rules && sudo udevadm trigger /dev/uinput'
    );
  }
  if (!hasGroup) {
    missing.push(
      "- Your user is not in the 'input' group. Run: sudo usermod -aG input $USER\n  (requires logout/login to take effect)"
    );
  }
  if (hasYdotoold && !hasService) {
    missing.push(
      "- No systemd service found for ydotoold. Enable it with:\n  systemctl --user enable ydotoold && systemctl --user start ydotoold"
    );
  }
  if (hasYdotoold && hasService && !daemonRunning) {
    missing.push(
      "- ydotoold service exists but is not running. Start it with:\n  systemctl --user start ydotoold"
    );
  }

  if (missing.length > 0) {
    const detail = missing.join("\n\n");
    log.warn("ydotool setup incomplete", { missing: missing.length }, "clipboard");

    dialog.showMessageBox({
      type: "warning",
      title: "Wayland Paste Setup",
      message: "ydotool is not fully configured. Auto-paste on Wayland may not work.",
      detail: `The following issues were detected:\n\n${detail}\n\nAfter fixing, restart Oats.`,
    });
  }
}

async function getYdotoolStatus() {
  const [hasYdotool, hasYdotoold, daemonRunning, hasUdevRule, hasGroup, isNixOSStatus] =
    await Promise.all([
      commandExistsAsync("ydotool"),
      commandExistsAsync("ydotoold"),
      isYdotooldRunningAsync(),
      udevRuleExistsAsync(),
      userInInputGroupAsync(),
      isNixOSAsync(),
    ]);
  const hasService = serviceFileExists();
  const hasUinput = isUinputAccessible();
  const isWayland =
    (process.env.XDG_SESSION_TYPE || "").toLowerCase() === "wayland" ||
    !!process.env.WAYLAND_DISPLAY;

  return {
    isLinux: process.platform === "linux",
    isWayland,
    hasYdotool,
    hasYdotoold,
    daemonRunning,
    hasService,
    hasUinput,
    hasUdevRule,
    hasGroup,
    isNixOS: isNixOSStatus,
    allGood: hasYdotool && hasYdotoold && daemonRunning && hasUinput && hasGroup,
  };
}

module.exports = { ensureYdotool, getYdotoolStatus };
