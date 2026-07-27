// One-time helper: authorizes THIS app against YOUR Google account (OAuth,
// not a service account) and prints a refresh token to put in .env as
// GOOGLE_REFRESH_TOKEN. Run once during setup; you don't need to run it
// again unless you revoke access or change scopes.
//
// Usage:
//   1. Fill in GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI
//      in .env (redirect URI must match what's registered in Google Cloud
//      Console exactly, e.g. http://localhost:3000/oauth2callback).
//   2. npm run google-auth
//   3. Open the printed URL, sign in with the Google account whose Drive
//      you want videos stored in, approve access.
//   4. The script catches the redirect, exchanges the code, and prints your
//      refresh token.

import http from "http";
import { URL } from "url";
import dotenv from "dotenv";
import { google } from "googleapis";

dotenv.config();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/oauth2callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.");
  process.exit(1);
}

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline", // required to get a refresh token
  prompt: "consent", // forces a refresh token even on repeat runs
  scope: ["https://www.googleapis.com/auth/drive"],
});

const { port } = new URL(REDIRECT_URI);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, REDIRECT_URI);
    if (url.pathname !== new URL(REDIRECT_URI).pathname) {
      res.writeHead(404);
      res.end();
      return;
    }

    const code = url.searchParams.get("code");
    if (!code) {
      res.writeHead(400);
      res.end("Missing ?code in redirect.");
      return;
    }

    const { tokens } = await oAuth2Client.getToken(code);
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Done - you can close this tab and check your terminal.");

    console.log("\nAdd this to your .env file:\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);

    if (!tokens.refresh_token) {
      console.log(
        "No refresh_token was returned - this usually means you've authorized this app before.\n" +
          "Go to https://myaccount.google.com/permissions, remove this app's access, and run this script again."
      );
    }

    server.close();
    process.exit(0);
  } catch (err) {
    console.error("Failed to exchange code for tokens:", err.message);
    res.writeHead(500);
    res.end("Something went wrong - check the terminal.");
    server.close();
    process.exit(1);
  }
});

server.listen(Number(port) || 3000, () => {
  console.log("Open this URL, sign in, and approve access:\n");
  console.log(authUrl, "\n");
});
