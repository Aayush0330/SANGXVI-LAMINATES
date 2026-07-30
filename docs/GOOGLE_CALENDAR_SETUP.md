# Google Calendar setup

Sanghvi ERP sends task deadlines, order progress and payment timelines to one
Google Calendar. Sync is one-way: editing a Google event does not change ERP
data.

## First test with a personal Gmail account

1. In Google Cloud, create or select a project.
2. Enable **Google Calendar API**.
3. Configure the OAuth consent screen and add the testing Gmail as a test user.
4. Create an OAuth client of type **Desktop app**.
5. Put its client ID and client secret in local `.env`.
6. Run:

   ```bash
   npm run calendar:connect
   ```

7. Select the testing Gmail, approve Calendar access, then copy the printed
   refresh token into `.env`.
8. Keep `GOOGLE_CALENDAR_ID="primary"`, restart ERP, create a dated task or
   order, and confirm that its event appears.

## Switch to the company owner later

Run `npm run calendar:connect` again and select the owner account. Replace only
`GOOGLE_CALENDAR_REFRESH_TOKEN` in the deployment secret store, then redeploy or
restart. Old events stay in the testing account; new and subsequently updated
ERP records go to the owner account.

## Production release

Configure these secret variables:

- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REFRESH_TOKEN`
- `GOOGLE_CALENDAR_ID` (`primary` for the connected account)
- `CRON_SECRET`

Then deploy database migrations with `npm run db:deploy`, generate Prisma Client,
and deploy the app. The scheduled job retries pending or failed syncs every ten
minutes. Never commit `.env` or tokens.
