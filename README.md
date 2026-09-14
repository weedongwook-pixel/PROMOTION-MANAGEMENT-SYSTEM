# PROMOTION-MANAGEMENT-SYSTEM

## Deploy to Cloudflare Workers

Every push to `main` deploys this repository to the existing Worker URL:

`https://white-pine-853e.quiet-surf-dda2.workers.dev/`

The workflow is defined in `.github/workflows/deploy-cloudflare.yml`. Before
the first automated deployment, sign in to Cloudflare as `it@rocks-foods.com`
and add these GitHub repository secrets under **Settings → Secrets and
variables → Actions**:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | An API token with **Account → Workers Scripts → Edit** permission for the account that owns `quiet-surf-dda2.workers.dev`. |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID from the Workers & Pages dashboard. |

Create the API token from **Cloudflare → My Profile → API Tokens**. Restrict it
to the production account; do not paste the token into code or commit it.

After the secrets are saved, use this release flow:

```bash
git add .
git commit -m "Describe the change"
git push origin main
```

GitHub Actions will deploy the Worker and every static file in this repository.
Open the Actions tab to see the deployment result.
