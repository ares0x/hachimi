// packages/core/src/vision/index.ts
export { attachmentToImagePart } from "./attachments.js";
export {
  DEFAULT_DESCRIPTION_PROMPT,
  VisionCompanion,
  type VisionCompanionOptions,
  type VisionDescribeResult,
  type VisionImageInput,
} from "./companion.js";
export { hasImageContent } from "./has-image.js";
export {
  consumeToolImageMarkers,
  registerToolImage,
  TOOL_IMAGE_MARKER,
} from "./image-registry.js";
export {
  preprocessVisualContent,
  type VisionPreprocessOptions,
} from "./preprocess.js";
