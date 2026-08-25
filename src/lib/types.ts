/** Shared API payload types — imported by client components as `import type`. */

export interface ProfileDTO {
  username: string;
  displayName: string;
  bio: string;
  htmlUrl: string;
  avatarUrl: string;
}

export interface ParamSchemaDTO {
  key: string;
  label: string;
  type: "number" | "color" | "select" | "text" | "boolean";
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  default: unknown;
}

export interface PreviewItem {
  id: string;
  name: string;
  family: string;
  description: string;
  estimatedCost: "low" | "medium" | "high";
  supportedFormats: Array<"svg" | "png" | "text">;
  paramSchema: ParamSchemaDTO[];
  defaults: Record<string, unknown>;
  defaultSeed: number;
  svg: string;
  error: boolean;
}

export interface GenerateResponse {
  profile: ProfileDTO;
  previews: PreviewItem[];
}

export interface RenderResponse {
  hash: string;
  url: string;
  urlPath: string;
  format: "svg" | "png" | "text";
  width: number;
  height: number;
  bytes: number;
  cached: boolean;
  alt: string;
  markdown: {
    centered: string;
    plain: string;
    codeBlock?: string;
  };
  textContent?: string;
  styleName: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
