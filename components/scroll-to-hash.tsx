"use client";

import { useEffect } from "react";

/**
 * Amène à l'ancre de l'adresse (« #modifier ») une fois le contenu affiché. Next.js ne défile vers une ancre que si
 * elle existe au moment de la navigation : un contenu qui arrive après, dans une frontière Suspense, resterait en bas.
 */
export function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
  return null;
}
