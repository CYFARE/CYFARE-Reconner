// UI State Management
let isScanning = false;
let scanResults = {
  links: [],
  jsFiles: [],
  endpoints: [],
  parameters: [],
  secrets: [],
  domains: new Set(),
};

// Initialize UI
document.addEventListener("DOMContentLoaded", async () => {
  initializeNavigation();
  initializeControls();
  loadHistory();
  initializeCharts();
});

// Navigation System
function initializeNavigation() {
  const tabs = document.querySelectorAll(".nav-tab");
  const views = document.querySelectorAll(".view");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetView = tab.dataset.view;

      // Update active states
      tabs.forEach((t) => t.classList.remove("active"));
      views.forEach((v) => v.classList.remove("active"));

      tab.classList.add("active");
      document.getElementById(`${targetView}View`).classList.add("active");

      // Load view-specific data
      if (targetView === "history") loadHistory();
      if (targetView === "analytics") updateAnalytics();
    });
  });
}

// Scanner Controls
function initializeControls() {
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const clearLogsBtn = document.getElementById("clearLogs");

  startBtn.addEventListener("click", startScan);
  stopBtn.addEventListener("click", stopScan);
  clearLogsBtn.addEventListener("click", clearLogs);
}

// Start Scanning
async function startScan() {
  isScanning = true;
  resetResults();
  updateUI("scanning");

  // Get current tab
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  addLog("info", `Starting scan on: ${tab.url}`);
  updateStatus("Scanning...", "#fbbf24");

  // Inject content script and start scan
  try {
    await browser.tabs.sendMessage(tab.id, {
      action: "startScan",
      url: tab.url,
    });
  } catch (error) {
    addLog("error", "Failed to start scan: " + error.message);
    stopScan();
  }
}

// Stop Scanning
function stopScan() {
  isScanning = false;
  updateUI("ready");
  updateStatus("Ready", "#4ade80");
  saveToHistory();
}

// Reset Results
function resetResults() {
  scanResults = {
    links: [],
    jsFiles: [],
    endpoints: [],
    parameters: [],
    secrets: [],
    domains: new Set(),
  };
  updateStats();
  updateProgress(0);
}

// Update UI State
function updateUI(state) {
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");

  if (state === "scanning") {
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } else {
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

// Update Status
function updateStatus(text, color) {
  const statusDot = document.querySelector(".status-dot");
  const statusText = document.querySelector(".status-text");

  statusDot.style.background = color;
  statusText.textContent = text;
}

// Update Progress
function updateProgress(percent) {
  const progressFill = document.getElementById("progressFill");
  const progressText = document.getElementById("progressText");

  progressFill.style.width = `${percent}%`;
  progressText.textContent = `${percent}%`;
}

// Update Stats
function updateStats() {
  document.getElementById("totalLinks").textContent = scanResults.links.length;
  document.getElementById("jsFiles").textContent = scanResults.jsFiles.length;
  document.getElementById("apiEndpoints").textContent =
    scanResults.endpoints.length;
  document.getElementById("parameters").textContent =
    scanResults.parameters.length;
}

// Add Log Entry
function addLog(type, message) {
  const logsContainer = document.getElementById("logsContainer");
  const time = new Date().toLocaleTimeString();

  const logEntry = document.createElement("div");
  logEntry.className = `log-entry ${type}`;

  const logTime = document.createElement("span");
  logTime.className = "log-time";
  logTime.textContent = `[${time}]`;

  const logMessage = document.createElement("span");
  logMessage.className = "log-message";
  logMessage.textContent = message;

  logEntry.appendChild(logTime);
  logEntry.appendChild(logMessage);

  logsContainer.appendChild(logEntry);
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

// Clear Logs
function clearLogs() {
  const logsContainer = document.getElementById("logsContainer");
  while (logsContainer.firstChild) {
    logsContainer.removeChild(logsContainer.firstChild);
  }
}

// Message Listener
browser.runtime.onMessage.addListener((message) => {
  if (message.action === "scanProgress") {
    updateProgress(message.progress);
    addLog("info", message.message);
  }

  if (message.action === "linkFound") {
    scanResults.links.push(message.link);
    // Track domain
    try {
      const domain = new URL(message.link.url).hostname;
      scanResults.domains.add(domain);
    } catch (e) {}
    updateStats();
    addLog("success", `Found: ${message.link.url}`);
  }

  if (message.action === "jsFileFound") {
    scanResults.jsFiles.push(message.file);
    updateStats();
    addLog("info", `JS File: ${message.file.url}`);
  }

  if (message.action === "endpointFound") {
    scanResults.endpoints.push(message.endpoint);
    updateStats();
    addLog("warning", `Endpoint: ${message.endpoint.url}`);
  }

  if (message.action === "parameterFound") {
    scanResults.parameters.push(message.parameter);
    updateStats();
    addLog("info", `Parameter: ${message.parameter.param}`);
  }

  if (message.action === "secretFound") {
    scanResults.secrets.push(message.secret);
    addLog("error", `Potential Secret: ${message.secret.type}`);
  }

  if (message.action === "scanComplete") {
    addLog("success", "Scan completed successfully!");
    generateAndDownloadResults();
    stopScan();
  }

  if (message.action === "error") {
    addLog("error", message.message);
  }
});

// Generate and Download Results
function generateAndDownloadResults() {
  const results = {
    metadata: {
      url: window.location.href,
      scanDate: new Date().toISOString(),
      version: "1.0",
    },
    statistics: {
      totalLinks: scanResults.links.length,
      jsFiles: scanResults.jsFiles.length,
      endpoints: scanResults.endpoints.length,
      parameters: scanResults.parameters.length,
      secrets: scanResults.secrets.length,
      uniqueDomains: scanResults.domains.size,
    },
    data: {
      links: scanResults.links,
      javascriptFiles: scanResults.jsFiles,
      apiEndpoints: scanResults.endpoints,
      parameters: scanResults.parameters,
      potentialSecrets: scanResults.secrets,
      domains: Array.from(scanResults.domains),
    },
  };

  const blob = new Blob([JSON.stringify(results, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  browser.downloads.download({
    url: url,
    filename: "results.json",
    saveAs: false,
  });

  addLog("success", "Results saved to results.json");
}

// Save to History
async function saveToHistory() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const currentUrl = tabs[0].url;

  const history = (await browser.storage.local.get("scanHistory")) || {};
  const historyArray = history.scanHistory || [];

  const historyEntry = {
    id: Date.now(),
    url: currentUrl,
    customName: null,
    date: new Date().toISOString(),
    stats: {
      links: scanResults.links.length,
      jsFiles: scanResults.jsFiles.length,
      endpoints: scanResults.endpoints.length,
      parameters: scanResults.parameters.length,
      secrets: scanResults.secrets.length,
    },
    fullData: scanResults,
  };

  historyArray.unshift(historyEntry);

  // Keep only last 20 entries
  if (historyArray.length > 20) {
    historyArray.pop();
  }

  await browser.storage.local.set({ scanHistory: historyArray });
}

// Load History
async function loadHistory() {
  const history = await browser.storage.local.get("scanHistory");
  const historyArray = history.scanHistory || [];
  const historyList = document.getElementById("historyList");

  while (historyList.firstChild) {
    historyList.removeChild(historyList.firstChild);
  }

  historyArray.forEach((item) => {
    const historyItem = document.createElement("div");
    historyItem.className = "history-item";
    historyItem.dataset.id = item.id;

    const displayName = item.customName || item.url;

    // Header row
    const headerRow = document.createElement("div");
    headerRow.className = "history-header-row";

    // Name section
    const nameSection = document.createElement("div");
    nameSection.className = "history-name-section";

    const nameDiv = document.createElement("div");
    nameDiv.className = "history-name";
    nameDiv.contentEditable = "false";
    nameDiv.textContent = displayName;

    const renameBtn = document.createElement("button");
    renameBtn.className = "btn-rename";
    renameBtn.textContent = "✏️";

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "btn-download";
    downloadBtn.title = "Download JSON";
    downloadBtn.textContent = "⬇️";

    nameSection.appendChild(nameDiv);
    nameSection.appendChild(renameBtn);
    headerRow.appendChild(nameSection);
    headerRow.appendChild(downloadBtn);

    // Date
    const dateDiv = document.createElement("div");
    dateDiv.className = "history-date";
    dateDiv.textContent = new Date(item.date).toLocaleString();

    // Original URL (if renamed)
    let originalUrlDiv;
    if (item.customName) {
      originalUrlDiv = document.createElement("div");
      originalUrlDiv.className = "history-original-url";
      originalUrlDiv.textContent = item.url;
    }

    // Stats
    const statsDiv = document.createElement("div");
    statsDiv.className = "history-stats";

    const stats = [
      `🔗 Links: ${item.stats.links}`,
      `📄 JS: ${item.stats.jsFiles}`,
      `🌐 APIs: ${item.stats.endpoints || 0}`,
      `🔍 Params: ${item.stats.parameters || 0}`,
    ];

    stats.forEach((stat) => {
      const statSpan = document.createElement("span");
      statSpan.textContent = stat;
      statsDiv.appendChild(statSpan);
    });

    // Assemble history item
    historyItem.appendChild(headerRow);
    historyItem.appendChild(dateDiv);
    if (originalUrlDiv) {
      historyItem.appendChild(originalUrlDiv);
    }
    historyItem.appendChild(statsDiv);

    // Add rename functionality
    renameBtn.addEventListener("click", () => {
      if (nameDiv.contentEditable === "false") {
        nameDiv.contentEditable = "true";
        nameDiv.focus();
        renameBtn.textContent = "✅";

        // Select all text
        const range = document.createRange();
        range.selectNodeContents(nameDiv);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        saveHistoryItemName(item.id, nameDiv.textContent);
        nameDiv.contentEditable = "false";
        renameBtn.textContent = "✏️";
      }
    });

    // Save on Enter key
    nameDiv.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        renameBtn.click();
      }
    });

    // Download functionality
    downloadBtn.addEventListener("click", () => {
      downloadHistoryItem(item);
    });

    historyList.appendChild(historyItem);
  });
}

// Save History Item Name
async function saveHistoryItemName(id, newName) {
  const history = await browser.storage.local.get("scanHistory");
  const historyArray = history.scanHistory || [];

  const item = historyArray.find((h) => h.id === id);
  if (item) {
    item.customName = newName.trim();
    await browser.storage.local.set({ scanHistory: historyArray });
  }
}

// Download History Item
function downloadHistoryItem(item) {
  const results = {
    metadata: {
      url: item.url,
      customName: item.customName,
      scanDate: item.date,
      version: "1.0",
    },
    statistics: item.stats,
    data: item.fullData,
  };

  const blob = new Blob([JSON.stringify(results, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const filename = item.customName
    ? `${item.customName.replace(/[^a-z0-9]/gi, "_")}_${new Date(item.date).getTime()}.json`
    : `scan_${new Date(item.date).getTime()}.json`;

  browser.downloads.download({
    url: url,
    filename: filename,
    saveAs: false,
  });
}

// Initialize Charts (Mock for demo)
function initializeCharts() {
  // In a real implementation, you would use Chart.js or similar
  // For now, we'll create placeholder canvases
  const linkTypeChart = document.getElementById("linkTypeChart");
  const domainChart = document.getElementById("domainChart");

  // Placeholder drawing
  [linkTypeChart, domainChart].forEach((canvas) => {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#e9ecef";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#6c757d";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Chart will appear here", canvas.width / 2, canvas.height / 2);
  });
}

// Update Analytics
async function updateAnalytics() {
  // Get scan history for analytics
  const history = await browser.storage.local.get("scanHistory");
  const historyArray = history.scanHistory || [];

  // Update summary
  const summaryDiv = document.getElementById("analyticsSummary");
  summaryDiv.innerHTML = `
    <span>📊 Total Scans: ${historyArray.length}</span>
    <span>📅 Last Scan: ${historyArray.length > 0 ? new Date(historyArray[0].date).toLocaleDateString() : "Never"}</span>
  `;

  // Aggregate data for analytics
  const linkTypes = {};
  const domainCounts = {};
  const insights = [];

  historyArray.forEach((scan) => {
    if (scan.fullData) {
      // Count link types
      scan.fullData.links.forEach((link) => {
        const type = link.type || "general";
        linkTypes[type] = (linkTypes[type] || 0) + 1;

        // Count domains
        try {
          const domain = new URL(link.url).hostname;
          domainCounts[domain] = (domainCounts[domain] || 0) + 1;
        } catch (e) {}
      });
    }
  });

  // Update link type chart
  const linkTypeChart = document.getElementById("linkTypeChart");
  const ctx1 = linkTypeChart.getContext("2d");
  drawPieChart(ctx1, linkTypes, linkTypeChart.width, linkTypeChart.height);

  // Update domain chart
  const domainChart = document.getElementById("domainChart");
  const ctx2 = domainChart.getContext("2d");
  const topDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {});
  drawBarChart(ctx2, topDomains, domainChart.width, domainChart.height);

  // Generate insights
  const totalScans = historyArray.length;
  const totalLinks = historyArray.reduce(
    (sum, scan) => sum + (scan.stats?.links || 0),
    0,
  );
  const avgLinksPerScan =
    totalScans > 0 ? Math.round(totalLinks / totalScans) : 0;
  const totalSecrets = historyArray.reduce(
    (sum, scan) => sum + (scan.stats?.secrets || 0),
    0,
  );

  if (totalScans > 0) {
    insights.push(`Average ${avgLinksPerScan} links found per scan`);

    if (totalSecrets > 0) {
      insights.push(
        `${totalSecrets} potential secrets detected across all scans`,
      );
    }

    const mostCommonType = Object.entries(linkTypes).sort(
      (a, b) => b[1] - a[1],
    )[0];
    if (mostCommonType) {
      insights.push(
        `Most common link type: ${mostCommonType[0]} (${mostCommonType[1]} links)`,
      );
    }

    const uniqueDomains = Object.keys(domainCounts).length;
    insights.push(`Links from ${uniqueDomains} unique domains discovered`);

    // Recent trend
    if (historyArray.length >= 2) {
      const recent = historyArray[0].stats.links;
      const previous = historyArray[1].stats.links;
      const trend = recent > previous ? "increased" : "decreased";
      insights.push(
        `Links found ${trend} by ${Math.abs(recent - previous)} in latest scan`,
      );
    }
  } else {
    insights.push("No scans performed yet");
    insights.push("Start a scan to see analytics");
  }

  // Update insights list
  const insightsList = document.getElementById("insightsList");
  while (insightsList.firstChild) {
    insightsList.removeChild(insightsList.firstChild);
  }

  insights.forEach((insight) => {
    const item = document.createElement("div");
    item.className = "insight-item";
    item.textContent = insight;
    insightsList.appendChild(item);
  });
}

// Simple chart drawing functions
function drawPieChart(ctx, data, width, height) {
  ctx.clearRect(0, 0, width, height);

  const total = Object.values(data).reduce((sum, val) => sum + val, 0);
  if (total === 0) {
    ctx.fillStyle = "#6c757d";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No data available", width / 2, height / 2);
    return;
  }

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 20;

  const colors = [
    "#667eea",
    "#764ba2",
    "#f59e0b",
    "#10b981",
    "#ef4444",
    "#3b82f6",
    "#8b5cf6",
  ];
  let currentAngle = -Math.PI / 2;
  let colorIndex = 0;

  Object.entries(data).forEach(([type, count]) => {
    const angle = (count / total) * 2 * Math.PI;

    // Draw pie slice
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + angle);
    ctx.closePath();
    ctx.fillStyle = colors[colorIndex % colors.length];
    ctx.fill();

    // Draw label
    const labelAngle = currentAngle + angle / 2;
    const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
    const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);

    ctx.fillStyle = "white";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(type, labelX, labelY);

    currentAngle += angle;
    colorIndex++;
  });
}

function drawBarChart(ctx, data, width, height) {
  ctx.clearRect(0, 0, width, height);

  if (Object.keys(data).length === 0) {
    ctx.fillStyle = "#6c757d";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No data available", width / 2, height / 2);
    return;
  }

  const margin = 20;
  const barWidth = (width - margin * 2) / Object.keys(data).length;
  const maxValue = Math.max(...Object.values(data));
  const scale = (height - margin * 2) / maxValue;

  Object.entries(data).forEach(([domain, count], index) => {
    const barHeight = count * scale;
    const x = margin + index * barWidth;
    const y = height - margin - barHeight;

    // Draw bar
    ctx.fillStyle = "#667eea";
    ctx.fillRect(x + barWidth * 0.1, y, barWidth * 0.8, barHeight);

    // Draw count
    ctx.fillStyle = "#2c3e50";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(count, x + barWidth / 2, y - 5);

    // Draw domain (truncated)
    ctx.save();
    ctx.translate(x + barWidth / 2, height - 5);
    ctx.rotate(-Math.PI / 4);
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    const truncated =
      domain.length > 15 ? domain.substring(0, 12) + "..." : domain;
    ctx.fillText(truncated, 0, 0);
    ctx.restore();
  });
}

// Clear History
document.getElementById("clearHistory").addEventListener("click", async () => {
  await browser.storage.local.set({ scanHistory: [] });
  loadHistory();
});
