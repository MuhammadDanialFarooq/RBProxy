// Proxy API with permanent uptime + request logging
// Made for Netlify Functions
import fetch from "node-fetch";

let requestCount = 0;
let lastPing = null;
let firstStarted = new Date().toISOString();

// GitHub repo info from environment
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = MuhammadDanialFarooq//process.env.GITHUB_REPO; // e.g. "username/portfolio"
const LOG_PATH = "logs/uptime.json";

async function updateGitHubLog(entry) {
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${LOG_PATH}`;

  // Get existing file content
  const getRes = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
    },
  });

  let fileData = [];
  let sha = null;

  if (getRes.status === 200) {
    const data = await getRes.json();
    sha = data.sha;
    fileData = JSON.parse(
      Buffer.from(data.content, "base64").toString("utf-8")
    );
  }

  fileData.push(entry);

  // Write back to GitHub
  const newContent = Buffer.from(JSON.stringify(fileData, null, 2)).toString("base64");

  const putRes = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({
      message: "Uptime log update",
      content: newContent,
      sha: sha,
    }),
  });

  return putRes.ok;
}

export default async (req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();

    // Status endpoint
    if (req.url.includes("/status")) {
      return res.status(200).json({
        success: true,
        firstStarted,
        lastPing,
        totalRequests: requestCount,
        uptime: Math.floor((Date.now() - new Date(firstStarted).getTime()) / 1000) + "s",
      });
    }

    // Proxy request
    const targetUrl =
      req.query.url || (req.body && req.body.url ? req.body.url : null);

    if (!targetUrl)
      return res.status(400).json({
        success: false,
        error: "Missing 'url' parameter. Example: ?url=https://api.github.com",
      });

    requestCount++;
    lastPing = new Date().toISOString();

    const response = await fetch(targetUrl);
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    // Log entry
    const logEntry = {
      timestamp: lastPing,
      url: targetUrl,
      status: response.status,
      success: response.ok,
    };

    // Save to GitHub asynchronously
    updateGitHubLog(logEntry).catch(console.error);

    return res.status(200).json({
      success: true,
      from: targetUrl,
      data,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
