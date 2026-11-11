import type { ComponentType } from "react";

/** Every lesson widget is a component taking the YAML parameters from its
 *  ```widget block, already validated against web/shared/registry.ts. Read
 *  parameters with the helpers in ./params.ts and apply the documented
 *  defaults. Wrap the widget in <WidgetFrame> from ../ui.tsx. */
export interface WidgetProps {
  params: Record<string, unknown>;
}
export type Widget = ComponentType<WidgetProps>;
