// Background Script - Handles message passing, download, and other core functionalities

/**
 * Combined listener for all runtime messages.
 * This is the central hub for communication between different parts of the extension.
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Relay messages from content script to popup
  if (sender.tab) {
    // Add tab information to the message for context
    const messageToPopup = {
      ...message,
      tabId: sender.tab.id,
      tabUrl: sender.tab.url,
    };

    // Forward the enhanced message to the popup
    browser.runtime.sendMessage(messageToPopup).catch((error) => {
      // It's common for the popup to be closed. We specifically check for the
      // "receiving end does not exist" error to avoid spamming the console.
      if (!error.message.includes("Could not establish connection")) {
        console.error("Error forwarding message to popup:", error);
      }
    });
  }
});

/**
 * Initialize the extension on first installation or update.
 */
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("CYFARE Reconner Extension installed successfully.");
    // Set default values in storage only on the first install.
    browser.storage.local.set({
      scanHistory: [],
    });
  }
});
