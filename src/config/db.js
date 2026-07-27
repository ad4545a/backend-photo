import dns from "dns";
import mongoose from "mongoose";
import { env } from "./env.js";

// Some ISPs/routers/VPNs silently drop DNS SRV queries (used by
// mongodb+srv:// connection strings) even though normal A-record lookups
// work fine. Node's default resolver then fails with
// "querySrv ECONNREFUSED" / "querySrv EBADNAME". Pointing Node at public
// DNS resolvers sidesteps that without needing any Windows network changes.
dns.setServers(["8.8.8.8", "1.1.1.1"]);

export async function connectDB() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.mongoUri);
  // eslint-disable-next-line no-console
  console.log("[db] MongoDB connected");
}