# Ysocial Admin

1. Run `pnpm db:migrate` in `api` to apply the moderation migrations.
2. Set `ADMIN_ORIGIN=http://localhost:3200` in `api/.env` for local development. Use the dashboard's HTTPS origin in production.
3. Register `<ADMIN_ORIGIN>/auth/callback` with CNS. If both apps use the same origin, they share one redirect URI.
4. Start the API on port 3100. In `web-admin`, run `pnpm install` and `pnpm dev`, then open [Ysocial Admin](http://localhost:3200).
5. Sign in with CNS. New and existing accounts start with the `user` role. To grant dashboard access, assign `admin` or `moderator` to an existing Ysocial account using a trusted database connection. Replace `your_handle` with its Ysocial handle.

   ```sql
   UPDATE users
   SET role = 'admin', approved_at = COALESCE(approved_at, now())
   WHERE handle = 'your_handle';
   ```

Both staff roles can read the dashboard, including overview metrics, recent signups and posts, service health, and user and post details.

Open **Waitlist** to review new signups after they choose a handle. Admins can approve accounts. Pending accounts can browse but cannot make changes until approved.

- Open **Content review** to search by author or text and filter by posts or replies. Open a result to inspect its content, attachments, author, and related posts. Admins can permanently remove a post or reply after confirming. Removal also deletes the replies under that item.
- Open **Flags** to review image uploads rejected by NSFW screening in the last seven days. Staff can reveal the rejected image or open the uploader's profile. Admins can permanently remove a flag and its image.
- Open **Users** to search by name or handle. Admins can edit roles individually or select multiple users on the current page and choose **Apply role**. Use **Profile actions** to edit names or clear profile content. The dashboard protects your own role and the reserved admin role from edits.
- Use **Ban User** to make an account read-only and hide its posts. The signed-in user sees the reason, time, and moderator. The reason also appears on the public profile. **Unban User** restores posts and account access. **Remove User** permanently deletes the profile, its posts, and replies below those posts. The same CNS account can sign up again and must be approved.
- Open **Activity history** to see recorded content removals, profile edits, and role changes. Search by handle, action, detail, or ID, and filter by action type, staff member, target handle, and date range. Filters live in the URL, so a filtered view can be bookmarked or shared. **Export CSV** and **JSON** download everything matching the current filters (up to 100,000 rows). Cells that could run as spreadsheet formulas are prefixed with an apostrophe.
- Open **System status** for live service probes with latency (database, media storage, login provider, GIF provider, NSFW scanner), API process health (uptime, memory, event loop lag, live streams), database size, connections and largest tables, background queue backlogs, configured integrations, and community and moderation workload. It refreshes every 15 seconds. The **Overview** shows a summary of the same data.

In production, serve the build over HTTPS and reverse proxy `/api`, `/auth`, and `/health` on the dashboard origin to the API. In development, Vite proxies these paths to port 3100 unless you set `API_URL`.

Run `pnpm build` and `pnpm lint` in `web-admin`. Run `pnpm test` and `pnpm typecheck` in `api`.
