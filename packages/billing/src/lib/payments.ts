import { getPolarSdkConfig } from "@crikket/env/polar"
import { Polar } from "@polar-sh/sdk"

export const polarClient = new Polar(getPolarSdkConfig())
