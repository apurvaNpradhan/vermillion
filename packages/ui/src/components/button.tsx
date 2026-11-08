"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@workspace/ui/lib/utils";
import { Spinner } from "@workspace/ui/components/spinner";

export const buttonVariants = cva(
  // Raised keycap look: 8px corners, 36px tall, inset top highlight and bottom shade from the
  // `--button-*` shadows in globals.css. Touch pointers get a 44px hit area.
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent font-medium text-sm leading-4 tracking-[0.2px] outline-none transition-[background-color,box-shadow,scale] duration-200 ease-in-out pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background not-disabled:active:scale-[0.98] disabled:pointer-events-none disabled:opacity-30 data-loading:select-none data-loading:text-transparent [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:-mx-0.5 [&_svg]:shrink-0",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-9 px-3",
        icon: "size-9",
        "icon-lg": "size-10",
        "icon-sm": "size-8",
        "icon-xl": "size-11 [&_svg:not([class*='size-'])]:size-5",
        "icon-xs": "size-7 rounded-sm [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 px-3.5",
        sm: "h-8 gap-1.5 px-2.5",
        xl: "h-11 px-4 text-base [&_svg:not([class*='size-'])]:size-5",
        xs: "h-7 gap-1 rounded-sm px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
      },
      variant: {
        // The one bright, raised primary per screen.
        default:
          "bg-primary text-primary-foreground shadow-(--button-primary-shadow) hover:bg-primary-hover data-pressed:bg-primary-active [&:active]:bg-primary-active *:data-[slot=button-loading-indicator]:text-primary-foreground",
        // Rose text on a faint rose tint with a rose hairline ring.
        destructive:
          "bg-destructive/6 text-destructive-foreground shadow-(--button-danger-shadow) hover:bg-destructive/10 data-pressed:bg-destructive/14 dark:bg-destructive/12 dark:hover:bg-destructive/8 dark:data-pressed:bg-destructive/6 *:data-[slot=button-loading-indicator]:text-destructive-foreground",
        "destructive-outline":
          "bg-destructive/6 text-destructive-foreground shadow-(--button-danger-shadow) hover:bg-destructive/10 data-pressed:bg-destructive/14 dark:bg-destructive/12 dark:hover:bg-destructive/8 dark:data-pressed:bg-destructive/6 *:data-[slot=button-loading-indicator]:text-destructive-foreground",
        ghost:
          "text-subtle hover:bg-accent hover:text-foreground data-pressed:bg-accent *:data-[slot=button-loading-indicator]:text-foreground",
        link: "text-foreground underline-offset-4 hover:underline data-pressed:underline *:data-[slot=button-loading-indicator]:text-foreground",
        // Quiet raised button: faint gradient, hairline ring that brightens on hover.
        outline:
          "bg-card bg-(image:--button-secondary-fill) text-foreground shadow-(--button-secondary-shadow) hover:shadow-(--button-secondary-shadow-hover) data-pressed:shadow-(--button-secondary-shadow-pressed) dark:bg-transparent *:data-[slot=button-loading-indicator]:text-foreground",
        secondary:
          "bg-card bg-(image:--button-secondary-fill) text-foreground shadow-(--button-secondary-shadow) hover:shadow-(--button-secondary-shadow-hover) data-pressed:shadow-(--button-secondary-shadow-pressed) dark:bg-transparent *:data-[slot=button-loading-indicator]:text-foreground",
      },
    },
  },
);

export interface ButtonProps extends useRender.ComponentProps<"button"> {
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  render,
  children,
  loading = false,
  disabled: disabledProp,
  ...props
}: ButtonProps): React.ReactElement {
  const isDisabled: boolean = Boolean(loading || disabledProp);
  const typeValue: React.ButtonHTMLAttributes<HTMLButtonElement>["type"] = render
    ? undefined
    : "button";

  const defaultProps = {
    children: (
      <>
        {children}
        {loading && (
          <Spinner className="pointer-events-none absolute" data-slot="button-loading-indicator" />
        )}
      </>
    ),
    className: cn(buttonVariants({ className, size, variant })),
    "aria-disabled": loading || undefined,
    "data-loading": loading ? "" : undefined,
    "data-slot": "button",
    disabled: isDisabled,
    type: typeValue,
  };

  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });
}
