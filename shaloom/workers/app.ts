import { createRequestHandler } from "react-router";
import { demoMediaResponse, galleryMediaResponse } from "./gallery-api";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/gallery-media") {
      return galleryMediaResponse(request, env.MEDIA);
    }
    if (url.pathname.startsWith("/media/")) {
      return demoMediaResponse(request, env.MEDIA);
    }
    return requestHandler(request);
  },
} satisfies ExportedHandler<Env>;
