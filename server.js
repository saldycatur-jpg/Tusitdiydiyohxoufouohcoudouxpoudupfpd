const express = require("express");

const app = express();

app.use(express.json({ limit: "4kb" }));

// Tes apakah backend aktif
app.get("/", (req, res) => {
  res.json({
    service: "Play AI Backend",
    status: "online"
  });
});

// Autentikasi token
app.post("/auth", (req, res) => {
  const token = req.body?.token;

  if (
    typeof token !== "string" ||
    token.length > 256
  ) {
    return res.status(400).json({
      valid: false,
      message: "Invalid request"
    });
  }

  if (token !== process.env.PLAY_AI_TOKEN) {
    return res.status(401).json({
      valid: false,
      message: "Unauthorized"
    });
  }

  return res.json({
    valid: true,
    message: "Authentication successful"
  });
});

// Contoh keputusan AI menggunakan data simulasi
app.post("/ai/decide", (req, res) => {
  const { distance, hp } = req.body ?? {};

  if (
    typeof distance !== "number" ||
    typeof hp !== "number" ||
    !Number.isFinite(distance) ||
    !Number.isFinite(hp) ||
    distance < 0 ||
    hp < 0 ||
    hp > 100
  ) {
    return res.status(400).json({
      error: "Invalid input"
    });
  }

  let action = "chase";

  if (hp < 25) {
    action = "retreat";
  } else if (distance < 8) {
    action = "attack";
  }

  return res.json({ action });
});

const port = process.env.PORT || 10000;

app.listen(port, "0.0.0.0", () => {
  console.log("Play AI backend started");
});
