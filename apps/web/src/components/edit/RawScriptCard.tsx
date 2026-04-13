"use client";

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '~/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '~/components/ui/dialog';

interface RawScriptCardProps {
  sourceText: string;
}

export function RawScriptCard({ sourceText }: RawScriptCardProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          View source
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
        <article className="space-y-4 text-sm leading-6 text-foreground">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => <h1 className="text-2xl font-semibold">{children}</h1>,
              h2: ({ children }) => <h2 className="text-xl font-semibold">{children}</h2>,
              h3: ({ children }) => <h3 className="text-lg font-semibold">{children}</h3>,
              p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
              ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
              code: ({ children }) => (
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {children}
                </code>
              ),
              pre: ({ children }) => (
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{children}</pre>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">
                  {children}
                </blockquote>
              ),
              a: ({ children, href }) => (
                <a
                  href={href}
                  className="text-primary underline underline-offset-2"
                  target="_blank"
                  rel="noreferrer"
                >
                  {children}
                </a>
              ),
            }}
          >
            {sourceText}
          </ReactMarkdown>
        </article>
      </DialogContent>
    </Dialog>
  );
}
