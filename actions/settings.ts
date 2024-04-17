"use server"

import * as z from "zod"
import bcrypt from "bcryptjs"

import { unstable_update } from "@/auth"
import { db } from "@/lib/database"
import { currentUser } from "@/lib/auth"
import { generateVerificationToken } from "@/lib/tokens"
import { sendVerificationEmail } from "@/lib/mail"

import { SettingsModel } from "@/model/auth-model"
import { getUserByEmail, getUserById } from "@/data/user"

export async function settings(values: z.infer<typeof SettingsModel>) {
   const user = await currentUser()
   if (!user) return { error: "Unauthorized" }

   const dbUser = await getUserById(user.id!)
   if (!dbUser) return { error: "User not found" }

   if (user.isOAuth) {
      values.email = undefined
      values.password = undefined
      values.newPassword = undefined
      values.isTwoFactorEnabled = undefined
   }

   if (values.email && values.email !== user.email) {
      const existingUser = await getUserByEmail(values.email)
      if (existingUser && existingUser.id !== user.id) {
         return { error: "Email already in use" }
      }

      const verificationToken = await generateVerificationToken(values.email)
      await sendVerificationEmail(verificationToken.email, verificationToken.token)

      return { success: "Verification email sent!" }
   }

   if (values.password && values.newPassword && dbUser.password) {
      const passwordMatch = await bcrypt.compare(values.password, dbUser.password)
      if (!passwordMatch) {
         return { error: "Incorrect password!" }
      }

      const hashedPassword = await bcrypt.hash(values.newPassword, 10)
      values.password = hashedPassword
      values.newPassword = undefined // Remove new password from values (not needed anymore)
   }

   const updatedUser = await db.user.update({
      where: { id: dbUser.id },
      data: { ...values },
   })

   unstable_update({
      user: {
         name: updatedUser.name,
         email: updatedUser.email,
         isTwoFactorEnabled: updatedUser.isTwoFactorEnabled,
         role: updatedUser.role,
      },
   })

   return { success: "Settings updated" }
}
