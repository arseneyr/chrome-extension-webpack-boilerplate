const path = require("path"),
  fs = require("fs-extra"),
  ContentScriptHandler = require("./content");

class ReloadPlugin {
  constructor(opts) {
    this.opts = Object.assign(
      {
        manifest: "manifest.json",
        contentScripts: [],
        backgroundScript: null,
        transformManifest: m => m
      },
      opts || {}
    );

    this.contentScriptHandler = new ContentScriptHandler(
      this.opts.contentScripts,
      this.opts.backgroundScript
    );
  }

  apply(compiler) {
    const manifestPath = path.resolve(
      compiler.options.context,
      this.opts.manifest
    );

    this.contentScriptHandler.apply(compiler);

    compiler.hooks.emit.tapPromise("ReloadPlugin", compilation =>
      fs.readFile(manifestPath, "utf8").then(json => {
        const manifest = [
          this.contentScriptHandler.transformManifest.bind(
            this.contentScriptHandler
          ),
          this.opts.transformManifest
        ].reduce((acc, cur) => cur(acc), JSON.parse(json));

        const manifestString = JSON.stringify(manifest, null, 2);
        compilation.assets["manifest.json"] = {
          source: () => manifestString,
          size: () => Buffer.byteLength(manifestString, "utf8")
        };
      })
    );
  }
}

module.exports = ReloadPlugin;
