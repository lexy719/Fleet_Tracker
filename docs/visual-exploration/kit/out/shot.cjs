const { execFileSync } = require("child_process"), path = require("path");
const f = path.resolve(process.argv[2]).split(path.sep).join("/");
execFileSync("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=" + process.argv[4], "--virtual-time-budget=6000", "--screenshot=" + path.resolve(process.argv[3]), "file:///" + f], { stdio: "ignore" });
