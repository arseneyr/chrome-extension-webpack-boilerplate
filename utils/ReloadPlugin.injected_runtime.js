/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
// eslint-disable-next-line no-unused-vars
var hotAddUpdateChunk = undefined;
var parentHotUpdateCallback = undefined;
var $require$ = undefined;
var $hotMainFilename$ = undefined;
var $hotChunkFilename$ = undefined;
var $crossOriginLoading$ = undefined;

module.exports = function() {
  // eslint-disable-next-line no-unused-vars
  function webpackHotUpdateCallback(chunkId, moreModules) {
    hotAddUpdateChunk(chunkId, moreModules);
    if (parentHotUpdateCallback) parentHotUpdateCallback(chunkId, moreModules);
  } //$semicolon

  // eslint-disable-next-line no-unused-vars
  function hotDownloadUpdateChunk(chunkId) {
    window.postMessage({ downloadChunk: $hotChunkFilename$ }, "*");
  }

  // eslint-disable-next-line no-unused-vars
  function hotDownloadManifest(requestTimeout) {
    requestTimeout = requestTimeout || 10000;
    return new Promise(function(resolve, reject) {
      var timeout = null;
      var onResponse = ({ data }) => {
        if (data.downloadManifestResponse) {
          clearTimeout(timeout);
          resolve(data.downloadManifestResponse);
        }
      };
      timeout = setTimeout(() => {
        window.removeEventListener("message", onResponse, false);
        reject(new Error("Hot manifest timed out"));
      }, requestTimeout);
      window.addEventListener("message", onResponse, false);
      window.postMessage(
        { downloadManifest: $require$.p + $hotMainFilename$ },
        "*"
      );
    });
  }
};
