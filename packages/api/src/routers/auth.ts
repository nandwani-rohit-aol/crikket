import { sendEmailVerificationOtpStrictProcedure } from "@crikket/auth/procedures/email-otp"
import { addOrganizationMemberDirectProcedure } from "@crikket/auth/procedures/organization-members"

export const authRouter = {
  addOrganizationMemberDirect: addOrganizationMemberDirectProcedure,
  sendEmailVerificationOtpStrict: sendEmailVerificationOtpStrictProcedure,
}
