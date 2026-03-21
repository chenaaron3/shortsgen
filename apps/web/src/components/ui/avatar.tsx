"use client";

import { cn } from "~/lib/utils";

function AvatarRoot({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted",
        className
      )}
      {...props}
    />
  );
}

function AvatarImage({
  className,
  src,
  alt,
  ...props
}: React.ComponentProps<"img">) {
  return (
    <img
      src={src}
      alt={alt ?? ""}
      className={cn("aspect-square h-full w-full object-cover", className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export { AvatarRoot, AvatarImage, AvatarFallback };
