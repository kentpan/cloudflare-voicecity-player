"use client"

import { Toaster as Sonner, ToasterProps } from "sonner"

/**
 * Sonner Toaster wrapper.
 * 原版依赖 next-themes 获取主题；本精简版固定 dark 主题（全局 dark mode），
 * 因此移除了 next-themes 依赖，theme 直接由 props 传入或默认 "dark"。
 */
const Toaster = ({ theme = "dark", ...props }: ToasterProps) => {
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={
        {
          "--normal-bg": "var[var(--popover)]",
          "--normal-text": "var[var(--popover-foreground)]",
          "--normal-border": "var[var(--border)]",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
