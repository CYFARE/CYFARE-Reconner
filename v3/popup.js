// CYFARE-Reconner/popup.js

// Global state
let isScanning = false;
// The scanResults object will be initialized properly in startScan
// It will be an instance of the ScanResults class once the scan starts.
let scanResults = null;

/**
 * Main entry point: Initializes the popup when the DOM is ready.
 */
document.addEventListener("DOMContentLoaded", () => {
  initializeNavigation();
  initializeControls();
  loadHistory(); // Load history on startup

  // Check the initial scanning state from storage or background
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    const tabId = tabs[0]?.id;
    if (tabId) {
      browser.runtime
        .sendMessage({ action: "getScanState", tabId })
        .then((response) => {
          if (response && response.isScanning) {
            isScanning = true;
            updateStatus("Scanning...", "active");
            document.getElementById("startBtn").disabled = true;
            document.getElementById("stopBtn").disabled = false;
          }
        })
        .catch(() => {
          /* Ignore errors if background isn't ready */
        });
    }
  });
});

/**
 * Sets up the navigation tabs (Scanner, History, Analytics).
 */
function initializeNavigation() {
  const tabs = document.querySelectorAll(".nav-tab");
  const views = document.querySelectorAll(".view");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      // Deactivate all tabs and views
      tabs.forEach((t) => t.classList.remove("active"));
      views.forEach((v) => v.classList.remove("active"));

      // Activate the clicked tab and corresponding view
      const viewName = tab.getAttribute("data-view");
      tab.classList.add("active");
      document.getElementById(`${viewName}View`).classList.add("active");

      // Special action for analytics tab
      if (viewName === "analytics" && scanResults) {
        updateAnalytics();
      }
    });
  });
}

/**
 * Sets up event listeners for the main control buttons.
 */
function initializeControls() {
  document.getElementById("startBtn").addEventListener("click", startScan);
  document.getElementById("stopBtn").addEventListener("click", stopScan);
  document.getElementById("clearLogs").addEventListener("click", clearLogs);
  document
    .getElementById("downloadBtn")
    .addEventListener("click", generateAndDownloadResults);
  document
    .getElementById("clearHistory")
    .addEventListener("click", async () => {
      await browser.storage.local.set({ scanHistory: [] });
      loadHistory(); // Refresh the view
    });
}

/**
 * Starts a new scan on the current active tab.
 */
async function startScan() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const currentTab = tabs[0];

  if (!currentTab || !currentTab.id) {
    addLog("error", "Could not get active tab information.");
    return;
  }

  // Initialize a new ScanResults object for the current scan
  // Assuming ScanResults class is loaded from scan-results.js
  scanResults = new ScanResults(currentTab.url);

  isScanning = true;
  resetUI();
  updateStatus("Starting...", "active");

  // Disable start, enable stop
  document.getElementById("startBtn").disabled = true;
  document.getElementById("stopBtn").disabled = false;

  // Send a message to the content script to begin the scan
  browser.tabs
    .sendMessage(currentTab.id, { action: "startScan" })
    .catch((err) => {
      addLog("error", "Failed to start scan. Please reload the page.");
      console.error("Start scan message failed:", err);
      stopScan(); // Reset state
    });

  addLog("info", "Scan initiated on the current page.");
}

/**
 * Stops the currently active scan.
 */
function stopScan() {
  isScanning = false;
  updateStatus("Scan stopped", "idle");

  // Enable start, disable stop
  document.getElementById("startBtn").disabled = false;
  document.getElementById("stopBtn").disabled = true;

  // Inform the content script to stop its operations
  browser.tabs
    .query({ active: true, currentWindow: true })
    .then((tabs) => {
      if (tabs[0]?.id) {
        browser.tabs.sendMessage(tabs[0].id, { action: "stopScan" });
      }
    })
    .catch((err) => {
      console.error("Stop scan message failed:", err);
    });

  addLog("warning", "Scan stopped by user.");
  if (scanResults && scanResults.getStats().totalLinks > 0) {
    saveToHistory();
    generateAndDownloadResults(); // Add a download button as well
  }
}

/**
 * Resets the UI elements to their initial state.
 */
function resetUI() {
  updateProgress(0);
  clearLogs();
  // Reset stats using an empty ScanResults object's stats
  const initialStats = new ScanResults().getStats();
  updateStats(initialStats);
}

/**
 * Listens for messages from the content script and updates the UI accordingly.
 */
browser.runtime.onMessage.addListener((message) => {
  if (!isScanning || !scanResults) return;

  switch (message.action) {
    case "linkFound":
      scanResults.addLink(message.data);
      addLog("success", `Found: ${message.data.type} - ${message.data.url}`);
      break;
    case "jsFileFound":
      scanResults.addJsFile(message.data);
      break;
    case "endpointFound":
      scanResults.addEndpoint(message.data);
      break;
    case "paramFound":
      scanResults.addParameter(message.data);
      break;
    case "secretFound":
      scanResults.addSecret(message.data);
      addLog("warning", `Potential Secret: ${message.data.type}`);
      break;
    case "scanProgress":
      updateProgress(message.data.progress);
      addLog("info", message.data.message);
      break;
    case "scanComplete":
      isScanning = false;
      updateStatus("Scan complete", "success");
      updateProgress(100);
      document.getElementById("startBtn").disabled = false;
      document.getElementById("stopBtn").disabled = true;
      addLog("info", "Comprehensive scan finished.");
      saveToHistory();
      updateAnalytics(); // Update analytics view with final data
      break;
  }

  // Update statistics on the UI after processing a message
  updateStats(scanResults.getStats());
});

// --- UI Update Functions ---

function updateStatus(text, state) {
  const statusText = document.querySelector(".status-text");
  const statusDot = document.querySelector(".status-dot");
  statusText.textContent = text;
  statusDot.style.background =
    state === "active"
      ? "#f59e0b"
      : state === "success"
        ? "#4ade80"
        : "#6c757d";
}

function updateProgress(percentage) {
  const fill = document.getElementById("progressFill");
  const text = document.getElementById("progressText");
  fill.style.width = `${percentage}%`;
  text.textContent = `${Math.round(percentage)}%`;
}

function updateStats(stats) {
  document.getElementById("totalLinks").textContent = stats.totalLinks;
  document.getElementById("jsFiles").textContent = stats.jsFiles;
  document.getElementById("apiEndpoints").textContent = stats.endpoints;
  document.getElementById("parameters").textContent = stats.parameters;
}

function addLog(type, message) {
  const container = document.getElementById("logsContainer");
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="log-time">${new Date().toLocaleTimeString()}</span> <span class="log-message">${message}</span>`;
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight; // Auto-scroll
}

function clearLogs() {
  document.getElementById("logsContainer").innerHTML = "";
}

/**
 * Generates the results and sends them to the background script for download.
 */
function generateAndDownloadResults() {
  if (!scanResults || scanResults.getStats().totalLinks === 0) {
    addLog("warning", "No results to download.");
    return;
  }

  const report = scanResults.generateReport();
  const filename = `scan_results_${new Date().getTime()}.json`;

  // Create a data URI and an anchor element to trigger the download
  const content = JSON.stringify(report, null, 2);
  const url =
    "data:application/json;charset=utf-8," + encodeURIComponent(content);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  addLog("success", `Results downloaded to ${filename}`);
}

// --- History and Analytics ---

async function saveToHistory() {
  if (!scanResults || scanResults.getStats().totalLinks === 0) return;

  const history =
    (await browser.storage.local.get("scanHistory")).scanHistory || [];
  const report = scanResults.generateReport();

  const historyEntry = {
    id: `scan_${Date.now()}`,
    date: report.metadata.scanDate,
    url: report.metadata.url,
    customName: new URL(report.metadata.url).hostname,
    stats: report.statistics,
    fullData: report.data, // Store the full data object
  };

  // Add to the beginning of the array
  history.unshift(historyEntry);

  // Limit history size to e.g., 50 entries
  if (history.length > 50) {
    history.pop();
  }

  await browser.storage.local.set({ scanHistory: history });
  addLog("info", "Scan results saved to history.");
  loadHistory(); // Refresh history view
}

async function loadHistory() {
  const listContainer = document.getElementById("historyList");
  listContainer.innerHTML = ""; // Clear existing list

  const { scanHistory } = await browser.storage.local.get("scanHistory");

  if (!scanHistory || scanHistory.length === 0) {
    listContainer.innerHTML = "<p>No past scans found.</p>";
    return;
  }

  scanHistory.forEach((item) => {
    const itemEl = document.createElement("div");
    itemEl.className = "history-item";
    itemEl.innerHTML = `
            <div class="history-header-row">
                <div class="history-name-section">
                    <span class="history-name" contenteditable="false" data-id="${item.id}">${item.customName}</span>
                    <button class="btn-rename" title="Rename">✏️</button>
                </div>
                <button class="btn-download" title="Download Results">💾</button>
            </div>
            <div class="history-date">${new Date(item.date).toLocaleString()}</div>
            <div class="history-original-url" title="${item.url}">${item.url}</div>
            <div class="history-stats">
                <span>🔗 ${item.stats.totalLinks}</span>
                <span>📜 ${item.stats.jsFiles}</span>
                <span>🔌 ${item.stats.endpoints}</span>
                <span>🔑 ${item.stats.parameters}</span>
            </div>
        `;

    // Event Listeners
    const renameBtn = itemEl.querySelector(".btn-rename");
    const nameSpan = itemEl.querySelector(".history-name");
    renameBtn.addEventListener("click", () => {
      const isEditing = nameSpan.getAttribute("contenteditable") === "true";
      if (isEditing) {
        nameSpan.setAttribute("contenteditable", "false");
        renameBtn.textContent = "✏️";
        saveHistoryItemName(item.id, nameSpan.textContent);
      } else {
        nameSpan.setAttribute("contenteditable", "true");
        nameSpan.focus();
        renameBtn.textContent = "✔️";
      }
    });

    itemEl
      .querySelector(".btn-download")
      .addEventListener("click", () => downloadHistoryItem(item));

    listContainer.appendChild(itemEl);
  });
}

async function saveHistoryItemName(itemId, newName) {
  const { scanHistory } = await browser.storage.local.get("scanHistory");
  const itemIndex = scanHistory.findIndex((i) => i.id === itemId);
  if (itemIndex > -1) {
    scanHistory[itemIndex].customName = newName;
    await browser.storage.local.set({ scanHistory });
  }
}

/**
 * Sends a history item's data to the background script for download.
 */
function downloadHistoryItem(item) {
  // Re-assemble the report structure for consistency
  const report = {
    metadata: {
      url: item.url,
      customName: item.customName,
      scanDate: item.date,
      version: "3.0",
    },
    statistics: item.stats,
    data: item.fullData,
  };

  const filename = `${item.customName.replace(/[^a-z0-9]/gi, "_")}_${new Date(
    item.date,
  ).getTime()}.json`;

  // Create a data URI and an anchor element to trigger the download
  const content = JSON.stringify(report, null, 2);
  const url =
    "data:application/json;charset=utf-8," + encodeURIComponent(content);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function updateAnalytics() {
  const insightsList = document.getElementById("insightsList");
  const downloadBtn = document.getElementById("downloadBtn");

  // Handle case where there is no scan data
  if (!scanResults || scanResults.getStats().totalLinks === 0) {
    insightsList.innerHTML =
      '<div class="insight-item">No data to analyze. Run a scan to see insights.</div>';
    // Hide the download button if there's nothing to download
    downloadBtn.style.display = "none";
    return;
  }

  // Show button and generate report
  downloadBtn.style.display = "block";
  const report = scanResults.generateReport();
  const stats = report.statistics;

  // Generate and display insights from the latest scan data
  insightsList.innerHTML = `
        <div class="insight-item">Found <strong>${stats.totalLinks}</strong> total links across <strong>${stats.uniqueDomains}</strong> unique domains.</div>
        <div class="insight-item">Discovered <strong>${stats.jsFiles}</strong> JavaScript files.</div>
        <div class="insight-item">Identified <strong>${stats.endpoints}</strong> potential API endpoints.</div>
        <div class="insight-item">A total of <strong>${stats.parameters}</strong> unique parameters were found.</div>
        <div class="insight-item">Detected <strong>${stats.secrets}</strong> potential secrets or keys.</div>
    `;
}
