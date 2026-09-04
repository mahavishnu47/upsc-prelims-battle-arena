/**
 * UPSC Prelims Battle Arena — Client Router
 * Hash-based routing with authentication guard
 */

import { Auth } from './auth.js';

class Router {
  constructor() {
    this.routes = {};
    this.currentRoute = null;
    this.params = {};

    window.addEventListener('hashchange', () => this.handleRoute());
  }

  add(pattern, handler) {
    this.routes[pattern] = handler;
  }

  navigate(hash) {
    window.location.hash = hash;
  }

  handleRoute() {
    let hash = window.location.hash.slice(1) || 'dashboard';

    // Auth guard
    const currentUser = Auth.getCurrentUser();
    if (!currentUser && hash !== 'auth') {
      window.location.hash = '#auth';
      return;
    }
    if (currentUser && hash === 'auth') {
      window.location.hash = '#dashboard';
      return;
    }

    // Match route with parameters (e.g., #battle/:id, #lobby/:id, #results/:id)
    let matchedHandler = null;
    let matchedParams = {};

    for (const pattern in this.routes) {
      const patternParts = pattern.split('/');
      const hashParts = hash.split('/');

      if (patternParts.length === hashParts.length) {
        let match = true;
        const params = {};

        for (let i = 0; i < patternParts.length; i++) {
          if (patternParts[i].startsWith(':')) {
            const paramName = patternParts[i].slice(1);
            params[paramName] = hashParts[i];
          } else if (patternParts[i] !== hashParts[i]) {
            match = false;
            break;
          }
        }

        if (match) {
          matchedHandler = this.routes[pattern];
          matchedParams = params;
          break;
        }
      }
    }

    if (matchedHandler) {
      this.currentRoute = hash;
      this.params = matchedParams;
      matchedHandler(matchedParams);
    } else if (this.routes['*']) {
      this.routes['*']();
    } else {
      console.warn("No route matched for hash:", hash);
      window.location.hash = currentUser ? '#dashboard' : '#auth';
    }
  }

  start() {
    this.handleRoute();
  }
}

export const router = new Router();
