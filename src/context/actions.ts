"use server";

import { getAdminAuth } from "@/lib/firebase/admin";
import { cookies } from "next/headers";

export const removeToken = async () => {
  const cookieStore = await cookies();
  cookieStore.delete("firebaseAuthToken");
  cookieStore.delete("firebaseAuthRefreshToken");
};

export const setToken = async ({
  token,
  refreshToken,
}: {
  token: string;
  refreshToken: string;
}) => {
  try {
    const auth = getAdminAuth();
    const verifiedToken = await auth.verifyIdToken(token);
    if (!verifiedToken) {
      return;
    }

    const userRecord = await auth.getUser(verifiedToken.uid);
    if (process.env.ADMIN_EMAIL === userRecord.email && !userRecord.customClaims?.admin) {
      await auth.setCustomUserClaims(verifiedToken.uid, {
        admin: true,
      });
    } else {
      if (!userRecord.customClaims?.user) {
        await auth.setCustomUserClaims(verifiedToken.uid, {
          user: true,
        });
      }
    }

    const cookieStore = await cookies();
    cookieStore.set("firebaseAuthToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
    cookieStore.set("firebaseAuthRefreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
  } catch (e) {
    console.log(e);
  }
};

export async function checkData(){
  
}
