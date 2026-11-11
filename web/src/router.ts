import { useEffect, useState } from "react";

// Hash routing: the app is one page served by the dev server, and a hash
// route survives a reload and a Dock relaunch without any server routing.
//   #/                 home (the path)
//   #/lesson/<id>      a lesson
//   #/review           due reviews
//   #/placement        the placement check
//   #/lab              the lab index;  #/lab/<tool> one explorer
//   #/gallery          every widget with example parameters (development)

export interface Route {
  name: string;
  arg?: string;
}

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] ?? "home", ...(parts[1] ? { arg: parts[1] } : {}) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function href(name: string, arg?: string): string {
  return `#/${name === "home" ? "" : name}${arg ? `/${encodeURIComponent(arg)}` : ""}`;
}
export function go(name: string, arg?: string): void {
  window.location.hash = href(name, arg);
}
