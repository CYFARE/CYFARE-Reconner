// Background Script - Handles message passing and processing

// Message relay between content script and popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Forward messages from content script to popup
  if (sender.tab) {
    // Add tab information to the message
    message.tabId = sender.tab.id;
    message.tabUrl = sender.tab.url;

    // Send to popup
    browser.runtime.sendMessage(message).catch(() => {
      // Popup might not be open, ignore error
    });
  }
});

// Initialize extension
browser.runtime.onInstalled.addListener(() => {
  console.log("Link Recon Extension installed");

  // Set default values
  browser.storage.local.set({
    scanHistory: [],
  });
});
