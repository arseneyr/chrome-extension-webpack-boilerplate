console.log("Content script loaded!");

const s = document.createElement("script");
s.src = chrome.runtime.getURL("injected.bundle.js");
(document.head || document.documentElement).appendChild(s);
