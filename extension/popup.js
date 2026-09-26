document.querySelector('#demo').addEventListener('click', () => {
  chrome.tabs.create({url: chrome.runtime.getURL('demo.html')});
});
