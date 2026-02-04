import { NextResponse } from "next/server";
import admin from "firebase-admin";
import crypto from "crypto";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

export async function POST(request: Request) {
  try {
    const { email, intent, deviceId } = await request.json();
    // intent: "login" | "enroll"

    /* -------------------------------------------------
       Basic validation
    -------------------------------------------------- */
    if (!email || !intent) {
      return NextResponse.json(
        { error: "Missing email or intent" },
        { status: 400 }
      );
    }

    if (!deviceId) {
      return NextResponse.json(
        { error: "Missing deviceId (Web SDK not initialized)" },
        { status: 400 }
      );
    }

    const API_KEY = process.env.CIRCLE_API_KEY;
    if (!API_KEY) {
      throw new Error("Missing CIRCLE_API_KEY");
    }

    const circleUserId = email;
    let challengeId: string | null = null;

    console.log("--- Starting Unified Circle Flow ---");
    console.log("INTENT:", intent, "EMAIL:", email);

    /* -------------------------------------------------
       1. Ensure user exists
    -------------------------------------------------- */
    const userResponse = await fetch(
      "https://api.circle.com/v1/w3s/users",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ userId: circleUserId }),
      }
    );

    console.log("1. User ensure status:", userResponse.status);
    // 201 = created, 409 = already exists (both OK)

    /* -------------------------------------------------
       2. Acquire session token
    -------------------------------------------------- */
    const sessionResponse = await fetch(
      "https://api.circle.com/v1/w3s/users/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ userId: circleUserId }),
      }
    );

    const sessionData = await sessionResponse.json();
    const userToken = sessionData.data?.userToken;
    const encryptionKey = sessionData.data?.encryptionKey;

    if (!userToken || !encryptionKey) {
      console.error("Session token error:", sessionData);
      throw new Error("Failed to acquire session token");
    }

    console.log("2. Session token acquired");

    /* -------------------------------------------------
       3. Initialize user (ENROLL ONLY)
    -------------------------------------------------- */
    if (intent === "enroll") {
      console.log("3. Initializing user…");

      const initResponse = await fetch(
        "https://api.circle.com/v1/w3s/user/initialize",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            "X-User-Token": userToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(), // ✅ MUST be UUID
            accountType: "SCA",
            blockchains: ["ETH-SEPOLIA"],
          }),
        }
      );

      const initData = await initResponse.json();

      // 155106 = already initialized → allowed
      if (!initResponse.ok && initData.code !== 155106) {
        console.error("Initialize error:", initData);
        throw new Error(initData.message || "Initialization failed");
      }

      challengeId = initData.data?.challengeId ?? null;
      console.log("3. User initialized:", !!challengeId);
    }

    /* -------------------------------------------------
       4. Request email OTP (ENROLL ONLY)
       Login OTP is handled by SDK.execute()
    -------------------------------------------------- */
    if (intent === "enroll") {
      console.log("4. Requesting email OTP (enroll)");

      const tokenResponse = await fetch(
        "https://api.circle.com/v1/w3s/users/email/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({
            email,
            deviceId,
            idempotencyKey: crypto.randomUUID(), // ✅ REQUIRED
          }),
        }
      );

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        console.error("Email token error:", tokenData);
        throw new Error(tokenData.message || "Failed to send OTP email");
      }

      console.log("4. Email OTP sent (enroll)");
    } else {
      console.log("4. Skipping email token for login (SDK handles OTP)");
    }

    /* -------------------------------------------------
       5. Log attempt (optional but useful)
    -------------------------------------------------- */
    const db = admin.firestore();
    await db.collection("auth_logs").add({
      email,
      intent,
      timestamp: new Date(),
      challengeId,
    });

    /* -------------------------------------------------
       6. Respond to client
    -------------------------------------------------- */
    return NextResponse.json({
      success: true,
      userToken,
      encryptionKey,
      challengeId,
      circleUserId,
    });

  } catch (error: any) {
    console.error("AUTH ERROR:", error.message);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
