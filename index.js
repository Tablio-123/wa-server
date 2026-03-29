const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const QRCode = require("qrcode");

const app = express();
app.use(express.json());

let qrData = null;
let isConnected = false;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", async (qr) => {
  console.log("QR received — open http://localhost:3001/qr");
  qrData = await QRCode.toDataURL(qr);
  isConnected = false;
});

client.on("ready", () => {
  console.log("WhatsApp connected!");
  isConnected = true;
  qrData = null;
});

client.on("disconnected", () => {
  console.log("Disconnected — restarting...");
  isConnected = false;
  client.initialize();
});

client.initialize();

app.get("/qr", (req, res) => {
  if (isConnected)
    return res.send("<body style='font-family:sans-serif;text-align:center;padding:40px'><h2 style='color:green'>✅ WhatsApp Connected!</h2></body>");
  if (!qrData)
    return res.send("<body style='font-family:sans-serif;text-align:center;padding:40px'><h2>⏳ Generating QR... (30-60s)</h2><p>Please wait...</p><script>setTimeout(()=>location.reload(),5000)</script></body>");
  res.send(`<body style='font-family:sans-serif;text-align:center;padding:40px;background:#f9f9f9'>
    <h2>📱 Scan with WhatsApp</h2>
    <p>WhatsApp → Settings → Linked Devices → Link a Device</p>
    <img src="${qrData}" style='width:280px;height:280px;border:3px solid #25D366;border-radius:8px'/>
    <p style='color:#888;font-size:13px'>Auto-refreshes in 30s</p>
    <script>setTimeout(()=>location.reload(),30000)</script>
    </body>`);
});

app.get("/status", (req, res) => res.json({ connected: isConnected }));

app.post("/send", async (req, res) => {
  const { phone, message } = req.body;
  if (!isConnected) return res.json({ ok: false, error: "Not connected — visit /qr" });
  if (!phone || !message) return res.json({ ok: false, error: "phone + message required" });
  try {
    const cleaned = phone.replace(/\D/g, "");
    const number = cleaned.startsWith("94") ? cleaned : "94" + cleaned.replace(/^0/, "");
    const chatId = number + "@c.us";
    await client.sendMessage(chatId, message);
    console.log("Sent to", phone);
    res.json({ ok: true });
  } catch (e) {
    console.error("Send error:", e.message);
    res.json({ ok: false, error: e.message });
  }
});

app.get("/", (req, res) => res.send("<body style='font-family:sans-serif;padding:40px'><h2>✅ WA Server</h2><a href='/qr'>Open QR Page</a></body>"));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log("WA Server on port " + PORT));