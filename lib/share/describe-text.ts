export const DESCRIBE_MAX = 600;

/** The model's reply as a description: no fences, markdown marks or a lead-in line; one paragraph block. */
export function cleanDescription(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^\s*(คำอธิบาย|description)\s*[:：]\s*/i, "")
    .replace(/[*_#>`]+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, DESCRIBE_MAX);
}

