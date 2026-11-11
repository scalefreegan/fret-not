import { WIDGETS } from "../../shared/registry.ts";
import { RenderWidget, WIDGET_EXAMPLES } from "../widgets/registry.tsx";

/** Every widget with example parameters. Development aid: open #/gallery, or
 *  #/gallery/<type> for one widget. */
export function Gallery({ only }: { only?: string }) {
  const types = Object.keys(WIDGETS).filter((t) => !only || t === only);
  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <h1 className="text-3xl font-bold">Widget gallery</h1>
      {types.map((type) => (
        <section key={type} id={type} className="mt-8">
          <h2 className="text-xl font-semibold">
            <a href={`#/gallery/${type}`}>{type}</a>
          </h2>
          <p className="text-sm text-fg-3">{WIDGETS[type].doc}</p>
          {(WIDGET_EXAMPLES[type] ?? [{}]).map((params, i) => (
            <div key={i}>
              <code className="text-xs text-fg-3">{JSON.stringify(params)}</code>
              <RenderWidget type={type} params={params} />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
