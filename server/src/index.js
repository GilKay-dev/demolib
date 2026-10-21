import { app } from "./app.js";
import { assertJwtSecret } from "./lib/token.js";

assertJwtSecret();

const port = process.env.PORT ?? 4000;

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
