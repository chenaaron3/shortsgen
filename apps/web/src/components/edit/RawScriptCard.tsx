"use client";

interface RawScriptCardProps {
  sourceText: string;
}

export function RawScriptCard({ sourceText }: RawScriptCardProps) {
  return (
    <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4">
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">
        Raw script
      </h3>
      <p className="whitespace-pre-wrap text-sm">{sourceText}</p>
    </div>
  );
}
