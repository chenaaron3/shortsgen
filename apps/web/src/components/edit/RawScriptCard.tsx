"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { cn } from "~/lib/utils";

interface RawScriptCardProps {
  sourceText: string;
}

export function RawScriptCard({ sourceText }: RawScriptCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-6">
      <div className="rounded-lg bg-muted/20">
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium text-muted-foreground hover:bg-muted/30">
          <ChevronDown
            className={cn(
              "size-4 shrink-0 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
          Raw script
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 py-3">
            <p className="whitespace-pre-wrap text-sm">{sourceText}</p>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
