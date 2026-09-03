import { IPipelineHooks } from "./IPipelineHooks.js";

/** Options accepted by the {@link Pipeline} constructor. */
export interface IPipelineOptions<T> extends IPipelineHooks<T> {
  /** Emit lifecycle diagnostics through `console.debug`. */
  debug?: boolean;
}