import bcrypt from "bcryptjs";
import readline from "readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question("Enter the admin password to hash: ", async (password) => {
  const hash = await bcrypt.hash(password, 10);
  console.log("\nAdd this to your .env file:\n");
  console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
  rl.close();
});
