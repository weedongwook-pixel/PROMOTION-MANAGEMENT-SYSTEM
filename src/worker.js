/**
 * Cloudflare Worker entry point.
 *
 * Static files are uploaded from the repository root by Wrangler and served
 * through the ASSETS binding. Keeping this tiny Worker makes deployments
 * repeatable while preserving the existing site paths and service worker.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/email/')) {
      if(!env.EMAIL_BACKEND)return Response.json({error:'email_backend_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
      // Same-account workers.dev targets require a service binding, not public fetch.
      return env.EMAIL_BACKEND.fetch(new Request(request,{redirect:'manual'}));
    }
    return env.ASSETS.fetch(request);
  },
};
