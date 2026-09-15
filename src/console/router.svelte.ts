/**
 * Rune wrapper over the pure router. Plan §4.3 (T5).
 *
 * `router.current` is the parsed `location.hash`; `navigate` writes the hash
 * (the `hashchange` listener then updates `current`, so the back button and
 * a typed URL take the same path). Safe to import without a DOM: it only
 * touches `location`/`window` inside guards.
 */
import { DEFAULT_ROUTE, href, parseRoute, type Route, type RouteInput } from './router';

function currentHash(): string {
  return typeof location !== 'undefined' ? location.hash : '';
}

class Router {
  current = $state<Route>(typeof location !== 'undefined' ? parseRoute(location.hash) : DEFAULT_ROUTE);
  private started = false;

  private readonly onHashChange = (): void => {
    this.current = parseRoute(currentHash());
  };

  /** Go to a route or a hash string; the query is passed through verbatim. */
  navigate(to: RouteInput | string): void {
    const target = typeof to === 'string' ? href(parseRoute(to)) : href(to);
    if (typeof location === 'undefined') {
      this.current = parseRoute(target);
      return;
    }
    if (location.hash === target) {
      this.current = parseRoute(target);
      return;
    }
    location.hash = target; // hashchange → onHashChange → current
  }

  start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    window.addEventListener('hashchange', this.onHashChange);
    this.onHashChange();
  }

  stop(): void {
    if (!this.started || typeof window === 'undefined') return;
    this.started = false;
    window.removeEventListener('hashchange', this.onHashChange);
  }
}

export const router = new Router();
