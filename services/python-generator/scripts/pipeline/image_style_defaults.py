"""Default style / mascot copy for image generation. Shared by generate_images and brand_resolve."""

STYLE_PROMPT = (
    "Hand-drawn stick figure style. Black line art on transparent background. "
    "Crisp, clean linework. Thin solid black outlines only. "
    "Flat style: no soft shading, no gradients, no airbrush, no gray smudges, no blotchy texture, no halftones. "
    "Optional: discrete hatching lines only where needed; never soft or blended shading. "
    "Motion lines (speed lines, curved dashes) around hands and objects when action is implied. "
    "Minimal or clean background. "
    "A single accent color may highlight one focal prop if it supports the scene. "
    "Use the reference for character design; place in the described scene. "
    "Result must look like crisp pen or chalk drawing, not rendered or shaded."
)

# Used for text-to-image-only models (e.g. hyper-flux): no mascot reference
MASCOT_DESCRIPTION = (
    "A minimalist, cute, gender-neutral stick-figure mascot with a very large perfectly round head "
    "and a very small simple body underneath it. "
)


def effective_prompts_for_pipeline(
    style_prompt: str | None,
    mascot_description: str | None,
) -> tuple[str, str]:
    """Resolve prompts for generate_images when brand resolution was not used (e.g. local CLI). None → defaults."""
    return (
        STYLE_PROMPT if style_prompt is None else style_prompt,
        MASCOT_DESCRIPTION if mascot_description is None else mascot_description,
    )
