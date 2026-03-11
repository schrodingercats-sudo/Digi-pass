const { spawn, exec } = require("node:child_process");

const APP_URL = "http://127.0.0.1:3000/index.html";

const openBrowser = () => {
  const platform = process.platform;
  if (platform === "win32") {
    exec(`start "" "${APP_URL}"`);
    return;
  }
  if (platform === "darwin") {
    exec(`open "${APP_URL}"`);
    return;
  }
  exec(`xdg-open "${APP_URL}"`);
};

const devProcess = spawn("npm", ["run", "dev"], {
  stdio: "inherit",
  shell: true
});

const openTimer = setTimeout(() => {
  openBrowser();
}, 1400);

devProcess.on("exit", () => {
  clearTimeout(openTimer);
});
