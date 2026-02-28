"use client"

import { CapturePlugin } from "@crikket/capture/react"
import { env } from "@crikket/env/web"
import { ThemeProvider } from "@crikket/ui/components/theme-provider"
import { Toaster } from "@crikket/ui/components/ui/sonner"
import { TooltipProvider } from "@crikket/ui/components/ui/tooltip"
import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { queryClient } from "@/utils/orpc"

// hardcoded for testing purposes
const CAPTURE_TEST_PUBLIC_KEY = "pk_test_JrK-KVtALelwlqS_Rd4Qo-Gz"

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NuqsAdapter>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        disableTransitionOnChange
        enableSystem
      >
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            {children}
            <CapturePlugin
              endpoint={env.NEXT_PUBLIC_SERVER_URL}
              publicKey={CAPTURE_TEST_PUBLIC_KEY}
            />
            <ReactQueryDevtools />
          </TooltipProvider>
        </QueryClientProvider>
        <Toaster richColors />
      </ThemeProvider>
    </NuqsAdapter>
  )
}
