import { env } from "./server"

export function getPolarSdkConfig() {
  return {
    accessToken: env.POLAR_ACCESS_TOKEN,
    server: env.NODE_ENV === "development" ? "sandbox" : "production",
  } as const
}
