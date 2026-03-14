"use client";

import { Card, CardContent, CardHeader } from "~/components/ui/card";

interface InspirationCardProps {
  title: string;
  description: string;
  onClick: () => void;
}

export function InspirationCard({ title, description, onClick }: InspirationCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left"
    >
      <Card
        size="sm"
        className="cursor-pointer transition-colors hover:bg-accent"
      >
        <CardHeader>
          <h3 className="font-semibold">{title}</h3>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </button>
  );
}
