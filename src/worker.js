/**
 * Cloudflare Worker entry point.
 *
 * Static files are uploaded from the repository root by Wrangler and served
 * through the ASSETS binding. Keeping this tiny Worker makes deployments
 * repeatable while preserving the existing site paths and service worker.
 */
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
