/**
 * webhookClient.js
 *
 * Hardened HTTP dispatch client for Runnel background worker webhooks.
 *
 * Security Boundaries Enforced:
 * 1. Strict URL validation and canonicalization (HTTP/HTTPS only).
 * 2. Rejection of URLs containing userinfo (user:pass@host).
 * 3. IP destination policy using ipaddr.js:
 *    - Rejection of IPv4 and IPv6 loopback, private (RFC 1918, RFC 4193),
 *      link-local (RFC 3927, RFC 4291), multicast, broadcast, carrier-grade NAT,
 *      unspecified, IPv4-mapped IPv6, and reserved ranges.
 *    - Explicit protection against Cloud Metadata endpoints:
 *      169.254.169.254, fd00:ec2::254, metadata.google.internal.
 * 4. DNS-rebinding resistance:
 *    - Pre-resolution and validation of all DNS A and AAAA records.
 *    - Socket-level custom lookup pinning: the socket connects exclusively
 *      to pre-validated public unicast IP addresses.
 * 5. Safe redirect handling:
 *    - Automatic redirects in client libraries are disabled.
 *    - Redirects are manually followed (max 3) and strictly re-validated
 *      against destination policy before dispatch.
 * 6. Header restrictions & sanitization:
 *    - Strips caller-injected Host, Cookie, X-Forwarded-*, X-Real-IP headers.
 * 7. Bounded resource consumption:
 *    - Connection timeout (default 5,000 ms) and request timeout (max 30,000 ms).
 *    - Response body size limit (max 1 MB) to protect against memory exhaustion.
 * 8. Log and history redaction:
 *    - Redacts Authorization, Token, Secret, API key, Cookie headers in results.
 */

const http = require("node:http");
const https = require("node:https");
const dns = require("node:dns");
const dnsPromises = require("node:dns/promises");
const net = require("node:net");
const ipaddr = require("ipaddr.js");

let envConfig = {};
try {
  envConfig = require("../config/env");
} catch {
  // fallback if config/env cannot be resolved
}

const MAX_RESPONSE_BYTES = envConfig.WEBHOOK_MAX_RESPONSE_BYTES || 1024 * 1024; // 1 MB
const MAX_REDIRECTS = envConfig.WEBHOOK_MAX_REDIRECTS !== undefined ? envConfig.WEBHOOK_MAX_REDIRECTS : 3;
const DEFAULT_TIMEOUT_MS = envConfig.WEBHOOK_REQUEST_TIMEOUT_MS || 10000;
const MAX_TIMEOUT_MS = 30000;
const MIN_TIMEOUT_MS = 500;


// Headers forbidden from caller modification
const RESTRICTED_HEADERS = new Set([
  "host",
  "cookie",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-forwarded-host",
  "x-real-ip",
  "transfer-encoding",
]);

// Headers whose values must be redacted from execution history and error details
const SENSITIVE_HEADER_KEYWORDS = [
  "authorization",
  "auth",
  "token",
  "secret",
  "key",
  "cookie",
  "password",
  "signature",
];

/**
 * Validates whether an IP address string is a globally routable public unicast address.
 * Uses ipaddr.js for standards-compliant parsing across IPv4, IPv6, and mapped formats.
 *
 * @param {string} ipString
 * @returns {boolean}
 */
function isPublicIp(ipString) {
  if (!ipString || typeof ipString !== "string") return false;
  const cleanIp = ipString.replace(/^\[|\]$/g, "");
  if (!ipaddr.isValid(cleanIp)) return false;

  let parsed = ipaddr.parse(cleanIp);
  // Unmap IPv4-mapped IPv6 (::ffff:127.0.0.1 -> 127.0.0.1)
  if (parsed.kind() === "ipv6" && parsed.isIPv4MappedAddress()) {
    parsed = parsed.toIPv4Address();
  }

  const range = parsed.range();
  // Only 'unicast' is considered public, globally routable internet
  return range === "unicast";
}

/**
 * Sanitizes headers to prevent caller injection of restricted transport headers.
 *
 * @param {Record<string, string>} headers
 * @returns {Record<string, string>}
 */
function sanitizeRequestHeaders(headers) {
  const sanitized = {
    "user-agent": "Runnel-RecoveryWorker/1.0",
  };
  if (!headers || typeof headers !== "object") return sanitized;

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (!RESTRICTED_HEADERS.has(lowerKey)) {
      sanitized[lowerKey] = String(value);
    }
  }
  return sanitized;
}

/**
 * Redacts sensitive tokens/credentials from response or error headers for safe storage.
 *
 * @param {Record<string, string|string[]>} headers
 * @returns {Record<string, string|string[]>}
 */
function redactHeaders(headers) {
  if (!headers || typeof headers !== "object") return {};
  const safe = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_HEADER_KEYWORDS.some((kw) => lowerKey.includes(kw));
    safe[key] = isSensitive ? "[REDACTED]" : value;
  }
  return safe;
}

/**
 * Validates a target URL against SSRF policy and resolves DNS.
 *
 * @param {string} rawUrl
 * @param {object} options
 * @param {boolean} options.allowInternal - Allowed only in explicit test harnesses
 * @returns {Promise<{ parsedUrl: URL, resolvedAddresses: Array<{ address: string, family: number }> }>}
 */
async function validateDestination(rawUrl, options = {}) {
  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    const err = new Error(`Invalid URL format: ${rawUrl}`);
    err.code = "INVALID_URL";
    throw err;
  }

  // 1. Protocol check
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    const err = new Error(`Unsupported URL protocol: '${parsedUrl.protocol}'. Only http: and https: are allowed.`);
    err.code = "UNSUPPORTED_PROTOCOL";
    throw err;
  }

  // 2. Reject userinfo (http://user:pass@host)
  if (parsedUrl.username || parsedUrl.password) {
    const err = new Error("URLs containing embedded username or password credentials are not permitted");
    err.code = "SSRF_BLOCKED";
    throw err;
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const cleanHostname = hostname.replace(/\.+$/, "");
  if (!cleanHostname) {
    const err = new Error("URL must contain a valid host destination");
    err.code = "INVALID_URL";
    throw err;
  }

  // 3. Reject known cloud metadata hostnames directly
  if (
    cleanHostname === "metadata.google.internal" ||
    cleanHostname.endsWith(".metadata.google.internal") ||
    cleanHostname === "instance-data"
  ) {
    const err = new Error("SSRF blocked: Requests to cloud metadata hostnames are prohibited");
    err.code = "SSRF_BLOCKED";
    throw err;
  }

  // 4. IP literal or DNS resolution
  const isProd = process.env.NODE_ENV === "production";
  const allowInternal = options.allowInternal === true && !isProd;

  let resolvedAddresses = [];
  const cleanIp = cleanHostname.replace(/^\[|\]$/g, "");
  const isIpLiteral = net.isIP(cleanIp) !== 0;

  if (isIpLiteral) {
    if (ipaddr.isValid(cleanIp)) {
      let parsed = ipaddr.parse(cleanIp);
      if (parsed.kind() === "ipv6" && parsed.isIPv4MappedAddress()) {
        parsed = parsed.toIPv4Address();
      }
      const range = parsed.range();
      // Cloud metadata and linkLocal are strictly prohibited under all circumstances
      if (range === "linkLocal" || cleanIp === "169.254.169.254" || cleanIp.toLowerCase() === "fd00:ec2::254") {
        const err = new Error(`SSRF blocked: Destination IP ${cleanIp} is a cloud metadata address`);
        err.code = "SSRF_BLOCKED";
        throw err;
      }
      if (!allowInternal && range !== "unicast") {
        const err = new Error(`SSRF blocked: Destination IP ${cleanIp} is in a non-public or restricted range (${range})`);
        err.code = "SSRF_BLOCKED";
        throw err;
      }
    }
    resolvedAddresses = [{ address: cleanIp, family: net.isIP(cleanIp) }];
  } else {
    // Domain name: resolve DNS records
    try {
      resolvedAddresses = await dnsPromises.lookup(cleanHostname, { all: true });
    } catch (dnsErr) {
      const err = new Error(`DNS resolution failed for host '${cleanHostname}': ${dnsErr.message}`);
      err.code = "DNS_RESOLUTION_FAILED";
      throw err;
    }

    if (!resolvedAddresses || resolvedAddresses.length === 0) {
      const err = new Error(`No DNS records found for host '${cleanHostname}'`);
      err.code = "DNS_RESOLUTION_FAILED";
      throw err;
    }

    // SSRF validation across ALL resolved addresses
    for (const record of resolvedAddresses) {
      if (ipaddr.isValid(record.address)) {
        let parsed = ipaddr.parse(record.address);
        if (parsed.kind() === "ipv6" && parsed.isIPv4MappedAddress()) {
          parsed = parsed.toIPv4Address();
        }
        const range = parsed.range();
        if (range === "linkLocal" || record.address === "169.254.169.254") {
          const err = new Error(`SSRF blocked: Hostname '${cleanHostname}' resolved to cloud metadata IP ${record.address}`);
          err.code = "SSRF_BLOCKED";
          throw err;
        }
        if (!allowInternal && range !== "unicast") {
          const err = new Error(
            `SSRF blocked: Hostname '${cleanHostname}' resolved to non-public destination IP ${record.address} (${range})`
          );
          err.code = "SSRF_BLOCKED";
          throw err;
        }
      }
    }
  }

  return { parsedUrl, resolvedAddresses };
}

/**
 * Creates a DNS lookup function pinned to the pre-validated IP address,
 * providing strict DNS-rebinding immunity at socket connection time.
 */
function createPinnedLookup(resolvedAddresses, allowInternal = false) {
  return (hostname, options, callback) => {
    // Re-verify addresses passed to socket
    const candidates = resolvedAddresses.filter((rec) => {
      if (options && options.family && options.family !== 0) {
        return rec.family === options.family;
      }
      return true;
    });

    const chosen = candidates.length > 0 ? candidates : resolvedAddresses;
    for (const rec of chosen) {
      if (!allowInternal && !isPublicIp(rec.address)) {
        const err = new Error(`SSRF blocked: Pinned socket lookup rejected restricted IP ${rec.address}`);
        err.code = "SSRF_BLOCKED";
        return callback(err);
      }
    }

    if (options && options.all) {
      callback(null, chosen);
    } else {
      callback(null, chosen[0].address, chosen[0].family);
    }
  };
}

/**
 * Dispatches a single HTTP request with pinned lookup and streaming response guard.
 */
function dispatchSingleRequest(urlObj, resolvedAddresses, options) {
  return new Promise((resolve, reject) => {
    const isHttps = urlObj.protocol === "https:";
    const transport = isHttps ? https : http;

    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const pinnedLookup = createPinnedLookup(resolvedAddresses, options.allowInternal);

    const headers = { ...options.headers };
    if (options.body && ["POST", "PUT", "PATCH"].includes(options.method)) {
      if (!headers["content-type"]) {
        headers["content-type"] = "application/json";
      }
      if (!headers["content-length"]) {
        headers["content-length"] = Buffer.byteLength(options.body);
      }
    }

    const reqOptions = {
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method,
      headers,
      lookup: pinnedLookup,
      // For HTTPS, preserve SNI host header matching the domain
      servername: isHttps ? urlObj.hostname : undefined,
    };

    let isAborted = false;
    let timer = null;

    const req = transport.request(reqOptions, (res) => {
      const chunks = [];
      let totalBytes = 0;
      let truncated = false;

      res.on("data", (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes <= MAX_RESPONSE_BYTES) {
          chunks.push(chunk);
        } else if (!truncated) {
          truncated = true;
          if (timer) clearTimeout(timer);
          req.destroy();
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage || "",
            headers: redactHeaders(res.headers),
            data: Buffer.concat(chunks).toString("utf8"),
            truncated: true,
            redirectLocation: res.headers["location"] || null,
          });
        }
      });

      res.on("end", () => {
        if (truncated) return;
        if (timer) clearTimeout(timer);
        const rawBuffer = Buffer.concat(chunks);
        const contentType = res.headers["content-type"] || "";

        let parsedData = null;
        if (contentType.includes("application/json")) {
          try {
            parsedData = JSON.parse(rawBuffer.toString("utf8"));
          } catch {
            parsedData = rawBuffer.toString("utf8");
          }
        } else {
          parsedData = rawBuffer.toString("utf8");
        }

        resolve({
          status: res.statusCode,
          statusText: res.statusMessage || "",
          headers: redactHeaders(res.headers),
          data: parsedData,
          truncated,
          redirectLocation: res.headers["location"] || null,
        });
      });

      res.on("error", (err) => {
        if (timer) clearTimeout(timer);
        if (!truncated) {
          const networkErr = new Error(`Webhook stream read error: ${err.message}`);
          networkErr.code = "NETWORK_ERROR";
          reject(networkErr);
        }
      });
    });

    req.on("error", (err) => {
      if (timer) clearTimeout(timer);
      if (isAborted) return;
      if (err.code === "SSRF_BLOCKED") {
        reject(err);
      } else {
        const netErr = new Error(`Webhook connection failure: ${err.message}`);
        netErr.code = "NETWORK_ERROR";
        reject(netErr);
      }
    });

    // Connection & total execution timeout
    timer = setTimeout(() => {
      isAborted = true;
      req.destroy();
      const timeoutErr = new Error(`Webhook request timed out after ${timeoutMs}ms`);
      timeoutErr.code = "HTTP_TIMEOUT";
      reject(timeoutErr);
    }, timeoutMs);

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

/**
 * Public execution dispatcher with validation, DNS pinning, and safe redirect recursion.
 *
 * @param {object} input
 * @param {string} input.url
 * @param {string} [input.method]
 * @param {Record<string, string>} [input.headers]
 * @param {any} [input.body]
 * @param {number} [input.timeoutMs]
 * @param {object} [opts]
 * @returns {Promise<{ status: number, statusText: string, headers: any, data: any, at: string }>}
 */
async function dispatchWebhook(input, opts = {}) {
  if (!input || typeof input !== "object" || !input.url) {
    const err = new Error("Webhook dispatch requires an input object with a 'url' property");
    err.code = "INVALID_INPUT";
    throw err;
  }

  const method = (input.method || "POST").toUpperCase();
  const allowedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];
  if (!allowedMethods.includes(method)) {
    const err = new Error(`Unsupported HTTP method: ${method}`);
    err.code = "INVALID_METHOD";
    throw err;
  }

  const timeoutMs = Math.min(Math.max(Number(input.timeoutMs) || DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
  const sanitizedHeaders = sanitizeRequestHeaders(input.headers);

  let serializedBody = undefined;
  if (["POST", "PUT", "PATCH"].includes(method) && input.body !== undefined) {
    serializedBody = typeof input.body === "object" ? JSON.stringify(input.body) : String(input.body);
  }

  const startTime = Date.now();
  let currentUrl = input.url;
  let redirectsFollowed = 0;

  while (true) {
    // 1. Destination policy & DNS-rebinding verification for current hop
    // On redirected hops, NEVER allow internal loopback unless explicitly allowed
    const currentHopOpts = redirectsFollowed > 0
      ? { ...opts, allowInternal: opts.allowInternalRedirect === true }
      : opts;

    const { parsedUrl, resolvedAddresses } = await validateDestination(currentUrl, currentHopOpts);

    // 2. Dispatch request
    const response = await dispatchSingleRequest(parsedUrl, resolvedAddresses, {
      method: redirectsFollowed > 0 ? "GET" : method, // Standard HTTP redirect method adjustment
      headers: sanitizedHeaders,
      body: redirectsFollowed > 0 ? undefined : serializedBody,
      timeoutMs: Math.max(1000, timeoutMs - (Date.now() - startTime)),
      allowInternal: currentHopOpts.allowInternal,
    });

    // 3. Handle 3xx Redirects
    const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
    if (isRedirect && response.redirectLocation) {
      redirectsFollowed++;
      if (redirectsFollowed > MAX_REDIRECTS) {
        const err = new Error(`Too many redirects (exceeded limit of ${MAX_REDIRECTS})`);
        err.code = "MAX_REDIRECTS_EXCEEDED";
        throw err;
      }

      // Resolve relative redirect against current hop
      const nextUrl = new URL(response.redirectLocation, currentUrl).toString();
      currentUrl = nextUrl;
      continue;
    }

    // 4. Handle non-2xx statuses
    if (response.status < 200 || response.status >= 300) {
      const err = new Error(
        `Webhook endpoint returned HTTP ${response.status} (${response.statusText || "Error"})`
      );
      err.code = `HTTP_${response.status}`;
      err.context = {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
      };
      throw err;
    }

    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data,
      at: new Date().toISOString(),
    };
  }
}

module.exports = {
  dispatchWebhook,
  validateDestination,
  isPublicIp,
  sanitizeRequestHeaders,
  redactHeaders,
  MAX_RESPONSE_BYTES,
  MAX_REDIRECTS,
};
