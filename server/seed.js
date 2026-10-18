import { migrate } from "./migrate.js";
import { seed } from "./services.js";
import { close } from "./db.js";
await migrate();
await seed();
await close();
console.log("Seed complete. Default initial login: admin / admin123");
