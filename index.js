import tls from 'tls';
import WebSocket from 'ws';
import extractJsonFromString from 'extract-json-from-string';
import axios from 'axios';
import https from 'https';
import http2 from 'http2';
const token = 'MTI0ODkxNjIyMDY0MDc1OTkxOQ.GUupzM.Rqu5kCaYK-XM42Bako1tIbBfN32d6i-Gm8cQlw';
const serverId = '1366515006027464784';
const channelId = '1366515850768683098';
const password = "G9^vK3!zR2#bMn6@";
const guilds = {};
let vanity = { vanity: "", event: null };
let mfaToken = null, savedTicket = null, lastSequence = null, heartbeatInterval = null;
const sessionCache = new Map();
let tlsSocket; let websocket;
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Authorization': token,
  'Content-Type': 'application/json',
  'X-Super-Properties': 'eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiRmlyZWZveCIsImRldmljZSI6IiIsInN5c3RlbV9sb2NhbGUiOiJ0ci1UUiIsImJyb3dzZXJfdXNlcl9hZ2VudCI6Ik1vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQ7IHJ2OjEzMy4wKSBHZWNrby8yMDEwMDEwMSBGaXJlZm94LzEzMy4wIiwiYnJvd3Nlcl92ZXJzaW9uIjoiMTMzLjAiLCJvc192ZXJzaW9uIjoiMTAiLCJyZWZlcnJlciI6Imh0dHBzOi8vd3d3Lmdvb2dsZS5jb20vIiwicmVmZXJyaW5nX2RvbWFpbiI6Ind3dy5nb29nbGUuY29tIiwic2VhcmNoX2VuZ2luZSI6Imdvb2dsZSIsInJlZmVycmVyX2N1cnJlbnQiOiIiLCJyZWZlcnJpbmdfZG9tYWluX2N1cnJlbnQiOiIiLCJyZWxlYXNlX2NoYW5uZWwiOiJjYW5hcnkiLCJjbGllbnRfYnVpbGRfbnVtYmVyIjozNTYxNDAsImNsaWVudF9ldmVudF9zb3VyY2UiOm51bGwsImhhc19jbGllbnRfbW9kcyI6ZmFsc2V9'
};
class SessionManager {
  constructor() {
    this.session = null;
    this.isConnecting = false;
    this.createSession();
  }
  createSession() {
    if (this.isConnecting) return;
    this.isConnecting = true;
    if (this.session) this.session.destroy();
    this.session = http2.connect("https://canary.discord.com", {
      settings: { enablePush: false },
      secureContext: tls.createSecureContext({
        ciphers: 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256',
        rejectUnauthorized: true
      })
    });
    this.session.on('error', () => {
      this.isConnecting = false;
      setTimeout(() => this.createSession(), 5000);
    });
    this.session.on('connect', () => this.isConnecting = false);
    this.session.on('close', () => {
      this.isConnecting = false;
      setTimeout(() => this.createSession(), 5000);
    });
  }
  async request(method, path, customHeaders = {}, body = null) {
    if (!this.session || this.session.destroyed) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.createSession();
    }
    const requestHeaders = {
      ...headers, 
      ...customHeaders, 
      ":method": method, 
      ":path": path, 
      ":authority": "canary.discord.com", 
      ":scheme": "https"
    };
    return new Promise((resolve, reject) => {
      const stream = this.session.request(requestHeaders);
      const chunks = [];
      stream.on("data", chunk => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks).toString()));
      stream.on("error", reject);
      if (body) stream.end(body);
      else stream.end();
    });
  }
}
const sessionManager = new SessionManager();
const handleData = async (data) => {
  try {
    const ext = await extractJsonFromString(data.toString());
    if (!Array.isArray(ext)) return console.error("No array", ext);
    const find = ext.find((e) => e.code || (e.message && e.message.toLowerCase().includes("rate")));
    if (find) {
      console.log(find);
      const content = `**||@everyone|| ${vanity.vanity}\n\`\`\`json\n${JSON.stringify(find, null, 2)}\`\`\`**`;
      const requestBody = JSON.stringify({ content });
      const request = [
        `POST /api/v7/channels/${channelId}/messages HTTP/1.1`,
        "Host: canary.discord.com",
        `Authorization: ${token}`,
        "Content-Type: application/json",
        `Content-Length: ${Buffer.byteLength(requestBody)}`,
        "",
        requestBody
      ].join("\r\n");
      if (tlsSocket && tlsSocket.writable) {
        tlsSocket.write(request);
        vanity.vanity = find;
      }
    }
  } catch (e) {}
};
async function refreshMfaToken() {
  try {
    const initialResponse = await sessionManager.request("PATCH", `/api/v7/guilds/${serverId}/vanity-url`);
    const data = JSON.parse(initialResponse);
    if (data.code === 60003) {
      savedTicket = data.mfa.ticket;
      const mfaResponse = await sessionManager.request(
        "POST",
        "/api/v9/mfa/finish",
        { "Content-Type": "application/json" },
        JSON.stringify({
          ticket: savedTicket,
          mfa_type: "password",
          data: password,
        })
      );
      const mfaData = JSON.parse(mfaResponse);
      if (mfaData.token) {
        mfaToken = mfaData.token;
        console.log('hersey olmasi gerektigi gibi.');
      }
    }
  } catch (error) {}
}
function tlsRequest(requestBody) {
  try {
    if (tlsSocket && tlsSocket.writable) {
      const jsonBody = JSON.stringify(requestBody);
      const request = [
        `PATCH /api/v7/guilds/${serverId}/vanity-url HTTP/1.1`,
        "Host: canary.discord.com",
        `Authorization: ${token}`,
        "Content-Type: application/json",
        `Content-Length: ${Buffer.byteLength(jsonBody)}`,
        "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.1130 Chrome/128.0.6613.186 Electron/32.2.7 Safari/537.36",
        "X-Super-Properties: eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiRGlzY29yZCBDbGllbnQiLCJyZWxlYXNlX2NoYW5uZWwiOiJwdGIiLCJjbGllbnRfdmVyc2lvbiI6IjEuMC4xMTMwIiwib3NfdmVyc2lvbiI6IjEwLjAuMTkwNDUiLCJvc19hcmNoIjoieDY0IiwiYXBwX2FyY2giOiJ4NjQiLCJzeXN0ZW1fbG9jYWxlIjoidHIiLCJoYXNfY2xpZW50X21vZHMiOmZhbHNlLCJicm93c2VyX3VzZXJfYWdlbnQiOiJNb3ppbGxhLzUuMCAoV2luZG93cyBOVCAxMC4wOyBXaW42NDsgeDY0KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBkaXNjb3JkLzEuMC4xMTMwIENocm9tZS8xMjguMC42NjEzLjE4NiBFbGVjdHJvbi8zMi4yLjcgU2FmYXJpLzUzNy4zNiIsImJyb3dzZXJfdmVyc2lvbiI6IjMyLjIuNyIsIm9zX3Nka192ZXJzaW9uIjoiMTkwNDUiLCJjbGllbnRfYnVpbGRfbnVtYmVyIjozNjY5NTUsIm5hdGl2ZV9idWlsZF9udW1iZXIiOjU4NDYzLCJjbGllbnRfZXZlbnRfc291cmNlIjpudWxsfQ==",
        `X-Discord-MFA-Authorization: ${mfaToken}`,
        `Cookie: __Secure-recent_mfa=${mfaToken}`,
        "",
        jsonBody
      ].join("\r\n");
      tlsSocket.write(request, 'utf-8');
    }
  } catch (e) {}
}
const http2istegi = (requestBody) => {
  try {
    sessionManager.request(
      "PATCH",
      `/api/v10/guilds/${serverId}/vanity-url`,
      {
        "X-Discord-MFA-Authorization": mfaToken,
        "Content-Type": "application/json",
      },
      JSON.stringify(requestBody)
    ).catch(() => {});
  } catch (err) {}
};
const performPatchRequest = (vanityCode) => {
  const requestBody = { code: vanityCode };
  vanity.vanity = vanityCode;
  const agent = new https.Agent({
    keepAlive: true,
    secureProtocol: 'TLSv1_2_method',
    rejectUnauthorized: false,
    zeroRtt: true,
    handshakeTimeout: 0,
    session: sessionCache.get('canary.discord.com'),
    maxSockets: Infinity,
    setNoDelay: true
  });
  const reqHeaders = {
    Authorization: token,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9164 Chrome/124.0.6367.243 Electron/30.2.0 Safari/537.36',
    'X-Super-Properties': 'eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiRGlzY29yZCBDbGllbnQiLCJyZWxlYXNlX2NoYW5uZWwiOiJwdGIiLCJjbGllbnRfdmVyc2lvbiI6IjEuMC4xMTMwIiwib3NfdmVyc2lvbiI6IjEwLjAuMTkwNDUiLCJvc19hcmNoIjoieDY0IiwiYXBwX2FyY2giOiJ4NjQiLCJzeXN0ZW1fbG9jYWxlIjoidHIiLCJoYXNfY2xpZW50X21vZHMiOmZhbHNlLCJicm93c2VyX3VzZXJfYWdlbnQiOiJNb3ppbGxhLzUuMCAoV2luZG93cyBOVCAxMC4wOyBXaW42NDsgeDY0KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBkaXNjb3JkLzEuMC4xMTMwIENocm9tZS8xMjguMC42NjEzLjE4NiBFbGVjdHJvbi8zMi4yLjcgU2FmYXJpLzUzNy4zNiIsImJyb3dzZXJfdmVyc2lvbiI6IjMyLjIuNyIsIm9zX3Nka192ZXJzaW9uIjoiMTkwNDUiLCJjbGllbnRfYnVpbGRfbnVtYmVyIjozNjY5NTUsIm5hdGl2ZV9idWlsZF9udW1iZXIiOjU4NDYzLCJjbGllbnRfZXZlbnRfc291cmNlIjpudWxsfQ==',
    'X-Discord-MFA-Authorization': mfaToken,
    Cookie: `__Secure-recent_mfa=${mfaToken}`
  };
  try {
    Promise.race([
      tlsRequest(requestBody),
      tlsRequest(requestBody),
      http2istegi(requestBody),
      http2istegi(requestBody),
      axios.patch(`https://canary.discord.com/api/v9/guilds/${serverId}/vanity-url`, requestBody, {
        headers: reqHeaders,
        httpsAgent: agent,
        maxRedirects: 0,
        validateStatus: () => true,
        decompress: false
      }).catch(() => {})
    ]).catch(() => {});
  } catch (e) {}
};
function connectWebSocket() {
  try {
    websocket = new WebSocket("wss://gateway-us-east1-b.discord.gg");
    websocket.onclose = reconnect;
    websocket.onmessage = handleWebSocketMessage;
    websocket.onopen = () => {
      try {
        websocket.send(JSON.stringify({
          op: 2,
          d: {
            token,
            intents: 1,
            properties: { 
              os: "linux",
              browser: "firefox",
              device: ""
            },
            zero_rtt: true,
            guild_subscriptions: false,
            large_threshold: 10
          }
        }));
        clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
          try {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
              websocket.send(JSON.stringify({ op: 1, d: lastSequence }));
            }
          } catch (e) {
            clearInterval(heartbeatInterval);
            reconnect();
          }
        }, 41250);
      } catch (e) {}
    };
    websocket.onerror = () => {
      clearInterval(heartbeatInterval);
      reconnect();
    };
  } catch (e) {
    setTimeout(connectWebSocket, 5000);
  }
}
const handleWebSocketMessage = (message) => {
  try {
    const payload = JSON.parse(message.data);
    if (payload.s) lastSequence = payload.s;
    const { op, t, d } = payload;
    if (t === "GUILD_UPDATE") {
      const find = guilds[d.guild_id];
      if (find && find !== d.vanity_url_code) {
        process.nextTick(() => performPatchRequest(find));
      }
    } else if (t === "READY") { 
      d.guilds.forEach(({ id, vanity_url_code }) => {
        if (vanity_url_code) {
          guilds[id] = vanity_url_code;
          console.log(`${vanity_url_code}`);
        }
      });
      console.log(guilds);
    }
    if (op === 7) {
      reconnect();
    } else if (op === 10) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = setInterval(() => {
        try {
          if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({ op: 1, d: lastSequence }));
          }
        } catch (e) {
          clearInterval(heartbeatInterval);
          reconnect();
        }
      }, payload.d.heartbeat_interval);
    }
  } catch (e) {}
};
const reconnect = () => {
  try {
    clearInterval(heartbeatInterval);
    if (websocket) {
      try {
        websocket.terminate();
      } catch (e) {}
    }
    setTimeout(connectTLS, 5000);
  } catch (e) {}
};
function connectTLS() {
  try {
    if (tlsSocket) {
      try {
        tlsSocket.destroy();
      } catch (e) {}
    }
    tlsSocket = tls.connect({
      host: 'canary.discord.com',
      port: 8443,
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.2',
      handshakeTimeout: 0,
      rejectUnauthorized: false,
      zeroRtt: true,
      servername: 'canary.discord.com',
      keepAlive: true,
      session: sessionCache.get('canary.discord.com')
    });
    tlsSocket.setNoDelay(true);
    tlsSocket.setKeepAlive(true, 10000);
    tlsSocket.on('data', handleData);
    tlsSocket.once('end', () => {
      console.log('TLS connection closed.');
      setTimeout(connectTLS, 5000);
    });
    tlsSocket.once('secureConnect', () => {
      connectWebSocket();
      refreshMfaToken();
      setInterval(refreshMfaToken, 120 * 1000);
    });
    tlsSocket.on('session', (session) => sessionCache.set('canary.discord.com', session));
    tlsSocket.on('error', () => {
      setTimeout(connectTLS, 5000);
    });
    const keepAliveHead = () => {
      try {
        if (tlsSocket && tlsSocket.writable) {
          tlsSocket.write('HEAD / HTTP/1.1\r\nHost: canary.discord.com\r\nConnection: keep-alive\r\nCache-Control: public, max-age=3600, stale-while-revalidate=60, stale-if-error=86400\r\nPragma: cache\r\nReferrer-Policy: no-referrer\r\n\r\n');
        }
      } catch (e) {}
    };
    const keepAliveHttp2 = () => {
      try {
        sessionManager.request('HEAD', '/').catch(() => {});
      } catch (e) {}
    };
    setInterval(keepAliveHttp2, 5000);
    setInterval(keepAliveHead, 10000);
  } catch (e) {
    setTimeout(connectTLS, 1000);
  }
}
process.on('uncaughtException', (err) => {
  console.log('Uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.log('Unhandled rejection:', reason);
});
connectTLS();
