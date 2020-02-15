const emitter = require("webpack/hot/emitter");

window.addEventListener(
  "message",
  ({ data }) => {
    const match =
      typeof data === "string" && data.match(/webpackHotUpdate(.+)/);
    if (match) {
      emitter.emit("webpackHotUpdate", match[1]);
    }
  },
  false
);
