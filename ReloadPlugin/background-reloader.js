chrome.runtime.onMessage.addListener((request, _, sendResponse) => {
  if (request.reload) {
    chrome.runtime.reload();
    sendResponse();
  }
});
