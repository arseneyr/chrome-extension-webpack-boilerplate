const url = require("url"),
  { generateLoadSource } = require("./utils");

class ContentScriptHandler {
  constructor(contentScripts, backgroundScript) {
    this.contentScripts = contentScripts;
    this.backgroundScript = backgroundScript;
    this.hotCspDomains = new Set();
    this.hot = false;
  }

  apply(compiler) {
    compiler.hooks.compile.tap("ReloadPlugin", () => {
      let needReloadServer = false;
      for (const content of this.contentScripts) {
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

            this.hotCspDomains.add(
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
        if (this.backgroundScript) {
          compiler.options.entry[this.backgroundScript] = [reloaderPath].concat(
            compiler.options.entry[this.backgroundScript]
          );
        } else {
          compiler.options.entry["background"] = reloaderPath;
        }

        compiler.hooks.entryOption.call(
          compiler.options.context,
          compiler.options.entry
        );
      }
    });

    compiler.hooks.thisCompilation.tap("ReloadPlugin", compilation => {
      compilation.mainTemplate.hooks.hotBootstrap.intercept({
        register: tap => ({
          ...tap,
          name: "ReloadPlugin",
          fn: (source, chunk, hash) => {
            this.hot = true;
            if (this.contentScripts.includes(chunk.name)) {
              return generateLoadSource(
                require("./content.runtime"),
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
  }
  transformManifest(manifest) {
    if (this.hot) {
      const newCsp = [
        `script-src 'self' 'unsafe-eval' ${Array.from(this.hotCspDomains).join(
          " "
        )}`,
        `object-src 'self'`
      ];
      manifest.content_security_policy = newCsp
        .concat(manifest.content_security_policy || [])
        .join("; ");
    }

    return manifest;
  }
}

module.exports = ContentScriptHandler;
