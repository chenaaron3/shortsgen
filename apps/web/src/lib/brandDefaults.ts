/**
 * Pipeline defaults for brand UI when the user has no saved brand row.
 * Keep in sync with services/python-generator/scripts/pipeline/image_style_defaults.py
 */
export const DEFAULT_STYLE_PROMPT =
  "Hand-drawn stick figure style. Black line art on transparent background. " +
  "Crisp, clean linework. Thin solid black outlines only. " +
  "Flat style: no soft shading, no gradients, no airbrush, no gray smudges, no blotchy texture, no halftones. " +
  "Optional: discrete hatching lines only where needed; never soft or blended shading. " +
  "Motion lines (speed lines, curved dashes) around hands and objects when action is implied. " +
  "Minimal or clean background. " +
  "A single accent color may highlight one focal prop if it supports the scene. " +
  "Use the reference for character design; place in the described scene. " +
  "Result must look like crisp pen or chalk drawing, not rendered or shaded.";

export const DEFAULT_MASCOT_DESCRIPTION =
  "A minimalist, cute, gender-neutral stick-figure mascot with a very large perfectly round head " +
  "and a very small simple body underneath it. ";

/** Same reference as path_utils.mascot_path() → assets/mascot_multiple.png, copied to public/. */
export const DEFAULT_MASCOT_IMAGE_SRC = "/brand-default-mascot.png";
