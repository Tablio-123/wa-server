const express = require("express");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const QRCode = require("qrcode");

const app = express();
app.use(express.json());

let sock = null;
let qrData = null;
let isConnected = false;
let retryCount = 0;

async function connectWA() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();
  console.log("Using WA version:", version.join("."));

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["Tablio", "Chrome", "1.0.0"],
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      try {
        qrData = await QRCode.toDataURL(qr);
        isConnected = false;
        console.log("QR ready — visit /qr");
      } catch (e) {
        console.error("QR error:", e.message);
      }
    }
    if (connection === "open") {
      isConnected = true;
      qrData = null;
      retryCount = 0;
      console.log("WhatsApp connected!");
    }
    if (connection === "close") {
      isConnected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log("Closed. Code:", code, "Retry:", shouldReconnect);
      if (shouldReconnect && retryCount < 10) {
        retryCount++;
        const delay = Math.min(retryCount * 2000, 15000);
        console.log(`Reconnecting in ${delay}ms... (attempt ${retryCount})`);
        setTimeout(connectWA, delay);
      }
    }
  });
}

app.get("/qr", (req, res) => {
  if (isConnected)
    return res.send(`<body style='font-family:sans-serif;text-align:center;padding:40px'>
      <h2 style='color:green'>✅ WhatsApp Connected!</h2>
      <p>WA Server is ready.</p></body>`);
  if (!qrData)
    return res.send(`<body style='font-family:sans-serif;text-align:center;padding:40px'>
      <h2>⏳ Generating QR...</h2>
      <p>Please wait 10-20 seconds</p>
      <script>setTimeout(()=>location.reload(),5000)</script></body>`);
  res.send(`<!DOCTYPE html><html><head><title>WA QR</title></head>
    <body style='font-family:sans-serif;text-align:center;padding:40px;background:#f9f9f9'>
    <h2>📱 Scan with WhatsApp</h2>
    <p>WhatsApp → Settings → Linked Devices → Link a Device</p>
    <img src="${qrData}" style='width:280px;height:280px;border:3px solid #25D366;border-radius:8px'/>
    <p style='color:#888;font-size:13px'>Auto-refreshes every 30s</p>
    <script>setTimeout(()=>location.reload(),30000)</script>
    </body></html>`);
});

app.get("/status", (req, res) => res.json({ connected: isConnected, qrReady: !!qrData }));

app.post("/send", async (req, res) => {
  const { phone, message } = req.body;
  if (!isConnected) return res.json({ ok: false, error: "Not connected — visit /qr" });
  if (!phone || !message) return res.json({ ok: false, error: "phone + message required" });
  try {
    const cleaned = phone.replace(/\D/g, "");
    const number = cleaned.startsWith("94") ? cleaned : "94" + cleaned.replace(/^0/, "");
    const jid = number + "@s.whatsapp.net";
    await sock.sendMessage(jid, { text: message });
    console.log("Sent to", phone);
    res.json({ ok: true });
  } catch (e) {
    console.error("Send error:", e.message);
    res.json({ ok: false, error: e.message });
  }
});

app.get("/", (req, res) => res.send(`<body style='font-family:sans-serif;padding:40px'>
  <h2>✅ WA Server Running</h2>
  <p>Status: <b>${isConnected ? "🟢 Connected" : "🔴 Not connected"}</b></p>
  <a href='/qr' style='background:#25D366;color:white;padding:10px 20px;border-radius:8px;text-decoration:none'>
    📱 ${isConnected ? "Connected" : "Scan QR"}</a>
  </body>`));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("WA Server on port " + PORT);
  connectWA();
});