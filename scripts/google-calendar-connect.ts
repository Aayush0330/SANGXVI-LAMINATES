import "dotenv/config";

import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();

if (!clientId || !clientSecret) {
  console.error(
    "Add GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET to .env first.",
  );
  process.exit(1);
}

const configuredClientId = clientId;
const configuredClientSecret = clientSecret;
const state = randomBytes(24).toString("hex");
const codeVerifier = randomBytes(48).toString("base64url");
const codeChallenge = createHash("sha256")
  .update(codeVerifier)
  .digest("base64url");
const server = createServer();
let callbackRedirectUri: string | null = null;

const callback = new Promise<string>((resolve, reject) => {
  const timeout = setTimeout(() => {
    server.close();
    reject(new Error("Google authorization timed out after 5 minutes."));
  }, 5 * 60 * 1000);

  server.on("request", (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const code = requestUrl.searchParams.get("code");
    const returnedState = requestUrl.searchParams.get("state");
    const error = requestUrl.searchParams.get("error");

    response.setHeader("content-type", "text/html; charset=utf-8");

    if (error) {
      response.end("<h1>Google Calendar connection cancelled.</h1><p>You can close this tab.</p>");
      clearTimeout(timeout);
      server.close();
      reject(new Error(`Google authorization failed: ${error}`));
      return;
    }

    if (!code || returnedState !== state) {
      response.statusCode = 400;
      response.end("<h1>Invalid callback.</h1><p>Please return to the terminal and try again.</p>");
      return;
    }

    response.end("<h1>Google Calendar connected.</h1><p>Return to the terminal to finish setup.</p>");
    clearTimeout(timeout);
    server.close();
    resolve(code);
  });
});

server.listen(0, "127.0.0.1", async () => {
  const address = server.address();

  if (!address || typeof address === "string") {
    console.error("Could not start the local Google authorization callback.");
    process.exit(1);
  }

  const redirectUri = `http://127.0.0.1:${address.port}`;
  callbackRedirectUri = redirectUri;
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: configuredClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();

  console.log("\nOpen this URL and select the Google account whose calendar Sanghvi ERP should use:\n");
  console.log(authorizationUrl.toString());
  console.log("\nWaiting for Google authorization...\n");

  if (process.platform === "darwin") {
    execFile("open", [authorizationUrl.toString()]);
  }
});

async function main() {
  const code = await callback;
  const redirectUri = callbackRedirectUri;

  if (!redirectUri) {
    throw new Error("Could not resolve the Google authorization callback URL.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: configuredClientId,
      client_secret: configuredClientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const payload = (await response.json()) as {
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.refresh_token) {
    throw new Error(
      payload.error_description
        ?? payload.error
        ?? "Google did not return a refresh token. Revoke the test grant and run this command again.",
    );
  }

  console.log("\nConnection successful. Copy this value into .env:");
  console.log(`GOOGLE_CALENDAR_REFRESH_TOKEN="${payload.refresh_token}"`);
  console.log("\nKeep this token private. Restart the ERP after saving it.");
}

main().catch((error) => {
  server.close();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
