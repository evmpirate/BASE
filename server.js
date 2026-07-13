// Local bootstrap: `AGENT_ID=8073 node server.js`
// (Vercel serves the same app through api/index.js instead.)
import app from "./app.js";

const PORT = process.env.PORT ?? 4021;
app.listen(PORT, () => {
  console.log(`TrailKeeper listening on :${PORT}`);
});
