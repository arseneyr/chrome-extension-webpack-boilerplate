var WebpackDevServer = require("webpack-dev-server"),
  webpack = require("webpack"),
  config = require("../webpack.config"),
  env = require("./env"),
  path = require("path");

config.output.publicPath = `http://127.0.0.1:${env.PORT}/`;
var wdsConfig = {
  hot: true,
  contentBase: path.join(__dirname, "../build"),
  sockPort: env.PORT,
  headers: {
    "Access-Control-Allow-Origin": "*"
  },
  disableHostCheck: true,
  host: "127.0.0.1",
  transportMode: "ws"
};

WebpackDevServer.addDevServerEntrypoints(config, wdsConfig);

if (config.entry.injected) {
  config.entry.injected[
    config.entry.injected.findIndex(e => e.includes("webpack-dev-server"))
  ] = path.join(__dirname, "./injected_hmr.js");
}

wdsConfig.injectClient = false;

var compiler = webpack(config);

var server = new WebpackDevServer(compiler, wdsConfig);

server.listen(env.PORT);
