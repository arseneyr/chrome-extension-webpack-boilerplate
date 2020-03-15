const { Template } = require("webpack"),
  path = require("path"),
  url = require("url"),
  fs = require("fs-extra");

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
    this.hot = false;
  }

  apply(compiler) {
    const manifestPath = path.resolve(
      compiler.options.context,
      this.opts.manifest
    );

    const hotCspDomains = new Set();

    compiler.hooks.compile.tap("ReloadPlugin", () => {
      let needReloadServer = false;
      for (const content of this.opts.contentScripts) {
        for (const [index, entry] of compiler.options.entry[
          content
        ].entries()) {
          const match = entry.match(/webpack-dev-server.*\?(.+)$/);
          if (match) {
            // Add the webpack-dev-server socket domain to the content-security-policy
            // by parsing the query string similarly to how the WDS client does it

            const { auth, query, hostname, protocol, port } = url.parse(
              match[1].replace("&", "?"),
              true
            );

            hotCspDomains.add(
              url.format({
                protocol,
                auth,
                hostname: query.sockHost || hostname,
                port: query.sockPort || port
              })
            );
          } else if (entry === require.resolve("webpack/hot/dev-server")) {
            // Use our own dev-server script that sends a message to the background
            // script instead of reloading the window on a failed update

            compiler.options.entry[content][index] = require.resolve(
              "./content-dev-server"
            );
            needReloadServer = true;
          }
        }
      }

      if (needReloadServer) {
        const reloaderPath = require.resolve("./background-reloader");
        if (this.opts.backgroundScript) {
          compiler.options.entry[this.opts.backgroundScript] = [
            reloaderPath
          ].concat(compiler.options.entry[this.opts.backgroundScript]);
        } else {
          compiler.options.entry["background"] = reloaderPath;
        }

        compiler.hooks.entryOption.call(
          compiler.options.context,
          compiler.options.entry
        );
      }
    });

    /* compiler.hooks.normalModuleFactory.tap("reloadPlugin", factory => {
      factory.hooks.parser.for("javascript/auto").tap("ReloadPlugin", parser =>
        parser.hooks.call
          .for("window.location.reload")
          .tap("ReloadPlugin", expr => {
            if (
              parser.state.current.request ==
              require.resolve("webpack/hot/dev-server")
            ) {

            }
          })
      );
    });
    
    compiler.hooks.beforeCompile.tap("ReloadPlugin", () => {
      // Replace the webpack-dev-server client with our custom
      // client that doesn't use websocket
      if (
        this.opts.injectedEntries.length &&
        typeof compiler.options.entry === "object" &&
        !(compiler.options.entry instanceof Array)
      ) {
        this.opts.injectedEntries.forEach(i => {
          if (compiler.options.entry[i] instanceof Array) {
            compiler.options.entry[i].forEach((entry, index) => {
              if (entry.includes("webpack-dev-server")) {
                compiler.options.entry[i][index] = path.resolve(
                  __dirname,
                  "./injected_hmr.js"
                );
              }
            });
          }
        });
      }
    });*/
    compiler.hooks.thisCompilation.tap("ReloadPlugin", compilation => {
      compilation.mainTemplate.hooks.hotBootstrap.intercept({
        register: tap => ({
          ...tap,
          name: "ReloadPlugin",
          fn: (source, chunk, hash) => {
            /*if (chunk.name === "injected") {
              return this.generateLoadSource(
                require("./ReloadPlugin.injected_runtime"),
                compilation.mainTemplate,
                source,
                hash
              );
            } else*/

            this.hot = true;
            if (this.opts.contentScripts.includes(chunk.name)) {
              return this.generateLoadSource(
                require("./ReloadPlugin.content_runtime"),
                compilation.mainTemplate,
                source,
                hash
              );
            }
            return tap.fn(source, chunk, hash);
          }
        })
      });
    });

    compiler.hooks.emit.tapPromise("ReloadPlugin", compilation =>
      fs.readFile(manifestPath, "utf8").then(json => {
        const manifest = JSON.parse(json);

        if (this.hot) {
          const newCsp = [
            `script-src 'self' 'unsafe-eval' ${Array.from(hotCspDomains).join(
              " "
            )}`,
            `object-src 'self'`
          ];
          manifest.content_security_policy = newCsp
            .concat(manifest.content_security_policy || [])
            .join("; ");
        }

        const newManifest = JSON.stringify(
          this.opts.transformManifest(manifest),
          null,
          2
        );
        compilation.assets["manifest.json"] = {
          source: () => newManifest,
          size: () => Buffer.byteLength(newManifest, "utf8")
        };
      })
    );
  }

  // Copied from https://github.com/webpack/webpack/blob/71be3bfa45a55aa8ea1b954ab1302565bb073bbc/lib/web/JsonpMainTemplatePlugin.js#L557-L608
  generateLoadSource(runtimeTemplate, mainTemplate, source, hash) {
    const globalObject = mainTemplate.outputOptions.globalObject;
    const hotUpdateChunkFilename =
      mainTemplate.outputOptions.hotUpdateChunkFilename;
    const hotUpdateMainFilename =
      mainTemplate.outputOptions.hotUpdateMainFilename;
    const crossOriginLoading = mainTemplate.outputOptions.crossOriginLoading;
    const hotUpdateFunction = mainTemplate.outputOptions.hotUpdateFunction;
    const currentHotUpdateChunkFilename = mainTemplate.getAssetPath(
      JSON.stringify(hotUpdateChunkFilename),
      {
        hash: `" + ${mainTemplate.renderCurrentHashCode(hash)} + "`,
        hashWithLength: length =>
          `" + ${mainTemplate.renderCurrentHashCode(hash, length)} + "`,
        chunk: {
          id: '" + chunkId + "'
        }
      }
    );
    const currentHotUpdateMainFilename = mainTemplate.getAssetPath(
      JSON.stringify(hotUpdateMainFilename),
      {
        hash: `" + ${mainTemplate.renderCurrentHashCode(hash)} + "`,
        hashWithLength: length =>
          `" + ${mainTemplate.renderCurrentHashCode(hash, length)} + "`
      }
    );
    const runtimeSource = Template.getFunctionContent(runtimeTemplate)
      .replace(/\/\/\$semicolon/g, ";")
      .replace(/\$require\$/g, mainTemplate.requireFn)
      .replace(
        /\$crossOriginLoading\$/g,
        crossOriginLoading ? JSON.stringify(crossOriginLoading) : "null"
      )
      .replace(/\$hotMainFilename\$/g, currentHotUpdateMainFilename)
      .replace(/\$hotChunkFilename\$/g, currentHotUpdateChunkFilename)
      .replace(/\$hash\$/g, JSON.stringify(hash));
    return `${source}
function hotDisposeChunk(chunkId) {
delete installedChunks[chunkId];
}
var parentHotUpdateCallback = ${globalObject}[${JSON.stringify(
      hotUpdateFunction
    )}];
${globalObject}[${JSON.stringify(hotUpdateFunction)}] = ${runtimeSource}`;
  }
}

module.exports = ReloadPlugin;
