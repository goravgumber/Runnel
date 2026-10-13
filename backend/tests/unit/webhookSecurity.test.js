/**
 * webhookSecurity.test.js
 *
 * Dedicated security verification suite for Runnel's production webhook client:
 * - URL canonicalization and protocol restriction.
 * - Userinfo rejection.
 * - Comprehensive IPv4 & IPv6 non-public range rejection (loopback, private, link-local, multicast, etc.).
 * - Cloud metadata protection (AWS, GCP, Azure).
 * - DNS resolution and rebinding verification.
 * - Redirect security: disallowing redirects to private targets and capping redirect hops.
 * - Restricted header sanitization.
 * - Redaction of sensitive headers in stored output.
 * - Streaming response-body size bounding.
 * - Error classification (timeouts, network errors, upstream HTTP errors).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const {
  dispatchWebhook,
  validateDestination,
  isPublicIp,
  sanitizeRequestHeaders,
  redactHeaders,
  MAX_RESPONSE_BYTES,
} = require("../../utils/webhookClient");

describe("Webhook Client Security & SSRF Boundary", () => {
  describe("1. URL Validation & Canonicalization", () => {
    it("rejects unsupported protocols (ftp, file, gopher, javascript)", async () => {
      const invalidUrls = [
        "ftp://example.com/file.txt",
        "file:///etc/passwd",
        "gopher://example.com/",
        "javascript:alert(1)",
      ];

      for (const url of invalidUrls) {
        await assert.rejects(
          async () => {
            await validateDestination(url);
          },
          (err) => {
            assert.equal(err.code, "UNSUPPORTED_PROTOCOL");
            return true;
          }
        );
      }
    });

    it("rejects URLs containing embedded userinfo credentials", async () => {
      const userinfoUrls = [
        "http://admin:secret@example.com/hook",
        "https://user@example.com/hook",
        "http://root:toor@1.1.1.1/",
      ];

      for (const url of userinfoUrls) {
        await assert.rejects(
          async () => {
            await validateDestination(url);
          },
          (err) => {
            assert.equal(err.code, "SSRF_BLOCKED");
            assert.match(err.message, /embedded username or password/);
            return true;
          }
        );
      }
    });

    it("rejects malformed URLs", async () => {
      await assert.rejects(
        async () => {
          await validateDestination("not-a-valid-url");
        },
        (err) => {
          assert.equal(err.code, "INVALID_URL");
          return true;
        }
      );
    });
  });

  describe("2. Comprehensive IP Range & Destination Policy (ipaddr.js)", () => {
    const restrictedIps = [
      // Loopback
      "127.0.0.1",
      "127.0.0.2",
      "127.10.20.30",
      "::1",
      // Private RFC 1918 & RFC 4193
      "10.0.0.1",
      "10.254.0.1",
      "172.16.0.1",
      "172.24.10.5",
      "172.31.255.255",
      "192.168.0.1",
      "192.168.100.50",
      "fc00::1",
      "fd00::1",
      "fd00:ec2::254", // AWS IMDSv6
      // Link-local RFC 3927 & RFC 4291 (Cloud metadata)
      "169.254.169.254",
      "169.254.1.1",
      "fe80::1",
      // Carrier-Grade NAT RFC 6598
      "100.64.0.1",
      "100.127.255.255",
      // Unspecified & Broadcast
      "0.0.0.0",
      "255.255.255.255",
      "::",
      // Multicast
      "224.0.0.1",
      "239.255.255.250",
      "ff02::1",
      // IPv4-mapped IPv6
      "::ffff:127.0.0.1",
      "::ffff:169.254.169.254",
      "::ffff:10.0.0.1",
    ];

    for (const ip of restrictedIps) {
      it(`blocks restricted IP address destination: ${ip}`, () => {
        assert.equal(isPublicIp(ip), false, `IP ${ip} should NOT be recognized as public unicast`);
      });
    }

    const publicIps = [
      "8.8.8.8",
      "1.1.1.1",
      "93.184.216.34",
      "142.250.190.46",
      "2606:4700:4700::1111",
      "2001:4860:4860::8888",
    ];

    for (const ip of publicIps) {
      it(`permits public internet IP address: ${ip}`, () => {
        assert.equal(isPublicIp(ip), true, `IP ${ip} should be recognized as public unicast`);
      });
    }
  });

  describe("3. Cloud Metadata & Hostname SSRF Protection", () => {
    it("blocks cloud metadata hostnames directly", async () => {
      const metadataUrls = [
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://metadata.google.internal.",
        "http://169.254.169.254/latest/meta-data/",
        "http://[fd00:ec2::254]/latest/meta-data/",
      ];

      for (const url of metadataUrls) {
        await assert.rejects(
          async () => {
            await validateDestination(url);
          },
          (err) => {
            assert.equal(err.code, "SSRF_BLOCKED");
            return true;
          }
        );
      }
    });

    it("blocks hostnames that resolve to loopback (e.g. localhost)", async () => {
      await assert.rejects(
        async () => {
          await validateDestination("http://localhost:8080/admin");
        },
        (err) => {
          assert.equal(err.code, "SSRF_BLOCKED");
          return true;
        }
      );
    });
  });

  describe("4. Redirect Validation & Security", () => {
    it("blocks redirects that attempt to pivot to an internal IP address", async () => {
      // Create server that issues a 302 redirect to 127.0.0.1
      const redirectServer = http.createServer((req, res) => {
        res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
        res.end();
      });
      await new Promise((resolve) => redirectServer.listen(0, resolve));
      const port = redirectServer.address().port;

      try {
        await assert.rejects(
          async () => {
            await dispatchWebhook(
              { url: `http://127.0.0.1:${port}/start` },
              { allowInternal: true } // allow 1st hop for test, 2nd hop to 169.254.169.254 must still be blocked by SSRF
            );
          },
          (err) => {
            assert.equal(err.code, "SSRF_BLOCKED");
            return true;
          }
        );
      } finally {
        await new Promise((resolve) => redirectServer.close(resolve));
      }
    });

    it("enforces maximum redirect limit (max 3)", async () => {
      let redirectHops = 0;
      const redirectLoopServer = http.createServer((req, res) => {
        redirectHops++;
        res.writeHead(302, { Location: `/hop-${redirectHops}` });
        res.end();
      });
      await new Promise((resolve) => redirectLoopServer.listen(0, resolve));
      const port = redirectLoopServer.address().port;

      try {
        await assert.rejects(
          async () => {
            await dispatchWebhook(
              { url: `http://127.0.0.1:${port}/hop-0` },
              { allowInternal: true, allowInternalRedirect: true }
            );
          },
          (err) => {
            assert.equal(err.code, "MAX_REDIRECTS_EXCEEDED");
            return true;
          }
        );
      } finally {
        await new Promise((resolve) => redirectLoopServer.close(resolve));
      }
    });
  });

  describe("5. Header Sanitization & Redaction", () => {
    it("strips caller-supplied Host, Cookie, and X-Forwarded-* headers", () => {
      const callerHeaders = {
        Host: "evil-spoofed.com",
        Cookie: "session=stolen",
        "X-Forwarded-For": "10.0.0.1",
        "X-Forwarded-Proto": "https",
        "X-Real-IP": "1.2.3.4",
        "Content-Type": "application/json",
        "X-Custom-Webhook-Event": "order.paid",
      };

      const sanitized = sanitizeRequestHeaders(callerHeaders);
      assert.equal(sanitized["host"], undefined);
      assert.equal(sanitized["cookie"], undefined);
      assert.equal(sanitized["x-forwarded-for"], undefined);
      assert.equal(sanitized["x-forwarded-proto"], undefined);
      assert.equal(sanitized["x-real-ip"], undefined);
      assert.equal(sanitized["content-type"], "application/json");
      assert.equal(sanitized["x-custom-webhook-event"], "order.paid");
      assert.equal(sanitized["user-agent"], "Runnel-RecoveryWorker/1.0");
    });

    it("redacts sensitive credential headers from execution output", () => {
      const responseHeaders = {
        "content-type": "application/json",
        authorization: "Bearer secret-upstream-token-123",
        "x-api-key": "ak_live_99887766",
        "set-cookie": "session_id=abc123secret",
        "etag": "W/12345",
      };

      const redacted = redactHeaders(responseHeaders);
      assert.equal(redacted["authorization"], "[REDACTED]");
      assert.equal(redacted["x-api-key"], "[REDACTED]");
      assert.equal(redacted["set-cookie"], "[REDACTED]");
      assert.equal(redacted["etag"], "W/12345");
      assert.equal(redacted["content-type"], "application/json");
    });
  });

  describe("6. Bounded Resource Consumption", () => {
    it("safely truncates responses exceeding maximum byte size (1 MB)", async () => {
      const largeServer = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        // Stream 1.5 MB of data
        const chunkSize = 64 * 1024;
        const totalChunks = 24; // 1.5 MB
        let sent = 0;
        const sendNext = () => {
          if (sent < totalChunks && !res.destroyed) {
            res.write("A".repeat(chunkSize));
            sent++;
            setImmediate(sendNext);
          } else {
            res.end();
          }
        };
        sendNext();
      });
      await new Promise((resolve) => largeServer.listen(0, resolve));
      const port = largeServer.address().port;

      try {
        const result = await dispatchWebhook(
          { url: `http://127.0.0.1:${port}/large` },
          { allowInternal: true }
        );
        assert.equal(result.status, 200);
        assert.ok(result.data.length <= MAX_RESPONSE_BYTES);
      } finally {
        await new Promise((resolve) => largeServer.close(resolve));
      }
    });

    it("triggers HTTP_TIMEOUT when upstream server hangs", async () => {
      const hangingServer = http.createServer((req, res) => {
        // Deliberately never respond
      });
      await new Promise((resolve) => hangingServer.listen(0, resolve));
      const port = hangingServer.address().port;

      try {
        await assert.rejects(
          async () => {
            await dispatchWebhook(
              { url: `http://127.0.0.1:${port}/hang`, timeoutMs: 600 },
              { allowInternal: true }
            );
          },
          (err) => {
            assert.equal(err.code, "HTTP_TIMEOUT");
            return true;
          }
        );
      } finally {
        await new Promise((resolve) => hangingServer.close(resolve));
      }
    });
  });

  describe("7. Upstream Error Classification", () => {
    it("maps 4xx and 5xx responses to structured HTTP_<STATUS> error codes", async () => {
      const statusServer = http.createServer((req, res) => {
        if (req.url === "/404") {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Resource Not Found" }));
        } else if (req.url === "/500") {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal Crash" }));
        }
      });
      await new Promise((resolve) => statusServer.listen(0, resolve));
      const port = statusServer.address().port;

      try {
        await assert.rejects(
          async () => {
            await dispatchWebhook(
              { url: `http://127.0.0.1:${port}/404` },
              { allowInternal: true }
            );
          },
          (err) => {
            assert.equal(err.code, "HTTP_404");
            return true;
          }
        );

        await assert.rejects(
          async () => {
            await dispatchWebhook(
              { url: `http://127.0.0.1:${port}/500` },
              { allowInternal: true }
            );
          },
          (err) => {
            assert.equal(err.code, "HTTP_500");
            return true;
          }
        );
      } finally {
        await new Promise((resolve) => statusServer.close(resolve));
      }
    });
  });
});
