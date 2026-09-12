chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ac-convert',
    title: 'Anything Convertable → Convert document',
    contexts: ['page', 'image', 'link'],
  });
});

chrome.contextMenus.onClicked.addListener((_info, tab) => {
  if (!tab?.id) return;
  chrome.tabs.create({ url: 'http://localhost:3000' });
});
