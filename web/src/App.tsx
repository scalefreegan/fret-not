import { Gallery } from "./pages/Gallery.tsx";
import { useRoute } from "./router.ts";

export default function App() {
  const route = useRoute();
  if (route.name === "gallery") return <Gallery only={route.arg} />;
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">Fret Not</h1>
      <p className="mt-2 text-fg-2">
        The app shell is being built. <a className="underline" href="#/gallery">Widget gallery</a>
      </p>
    </div>
  );
}
