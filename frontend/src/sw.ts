import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkOnly } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      // API requests (auth, shares, files, view counter, csrf...) must never
      // be touched by the runtime cache: 403s from ShareSecurityGuard and
      // range requests for media would otherwise surface as opaque
      // "no-response" / "network error" SW logs even though the app handles
      // them via try/catch. Let them go straight to the network.
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
  ],
});

serwist.addEventListeners();
