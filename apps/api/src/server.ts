import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { createRepository } from "./db.js";

const config = readConfig();
const repository = createRepository(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY);
const app = createApp(config, repository);

app.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
});
