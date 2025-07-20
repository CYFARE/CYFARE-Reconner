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

  // Handle specific background tasks
  if (message.action === "updateStats") {
    updateOverallStats(message.stats);
  }
});

// Update overall statistics
async function updateOverallStats(newStats) {
  const storage = await browser.storage.local.get("overallStats");
  const stats = storage.overallStats || {
    totalLinks: 0,
    totalScans: 0,
    totalSecrets: 0,
    uniqueDomains: new Set(),
  };

  stats.totalLinks += newStats.links || 0;
  stats.totalScans += 1;
  stats.totalSecrets += newStats.secrets || 0;

  if (newStats.domains) {
    newStats.domains.forEach((domain) => stats.uniqueDomains.add(domain));
  }

  await browser.storage.local.set({
    overallStats: {
      ...stats,
      uniqueDomains: stats.uniqueDomains.size,
    },
  });
}

// Initialize extension
browser.runtime.onInstalled.addListener(() => {
  console.log("Link Recon Extension installed");

  // Set default values
  browser.storage.local.set({
    scanHistory: [],
    overallStats: {
      totalLinks: 0,
      totalScans: 0,
      totalSecrets: 0,
      uniqueDomains: 0,
    },
  });
});
