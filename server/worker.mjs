import { handleFeedback } from "./feedback.mjs";
import { handleAdminAuth } from "./admin-auth.mjs";
import { handleRoutes } from "./routes.mjs";
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/routes")) return handleRoutes(request, env);
    if (path.startsWith("/api/admin/")) return handleAdminAuth(request, env);
    if (path.startsWith("/api/feedback")) return handleFeedback(request, env);
    return env.ASSETS.fetch(request);
  },
};
