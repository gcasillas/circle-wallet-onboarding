"use client";


import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";


export default function Home() {
 const [messages, setMessages] = useState<any[]>([]);
 const [inputValue, setInputValue] = useState("");


 // OTP state
 const [email, setEmail] = useState("");
 const [otpCode, setOtpCode] = useState("");
 const [userToken, setUserToken] = useState("");
 const [encryptionKey, setEncryptionKey] = useState("");
 const [challengeId, setChallengeId] = useState<string | null>(null);
 const [walletAddress, setWalletAddress] = useState("");
 const [deviceId, setDeviceId] = useState("");
 const [step, setStep] = useState(1); // 1=email, 2=otp, 3=wallet


 // 🔑 SINGLE SDK INSTANCE
 const sdkRef = useRef<W3SSdk | null>(null);


 /* -------------------------------------------------
    Initialize Circle SDK ONCE
 -------------------------------------------------- */
 useEffect(() => {
   const initCircle = async () => {
     const sdk = new W3SSdk(
       { appSettings: { appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID || "" } }
     );


     sdkRef.current = sdk;


     try {
       const id = await sdk.getDeviceId();
       setDeviceId(id);
       console.log("Device ID Initialized:", id);
     } catch (err) {
       console.error("Failed to get Device ID:", err);
     }
   };


   initCircle();
 }, []);


 /* -------------------------------------------------
    Request OTP (login or enroll)
 -------------------------------------------------- */
 const handleRequestOTP = async (
   e: React.FormEvent,
   intent: "login" | "enroll"
 ) => {
   e.preventDefault();


   const res = await fetch("/api/auth/otp", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ email, deviceId, intent }),
   });


   const data = await res.json();


   if (data.success) {
     setUserToken(data.userToken);
     setEncryptionKey(data.encryptionKey);
     setChallengeId(data.challengeId ?? null);
     setStep(2);
   }
 };


 /* -------------------------------------------------
    SDK callback (shared)
 -------------------------------------------------- */
 const handleLogout = () => {
  // Clear app state
  setEmail("");
  setOtpCode("");
  setUserToken("");
  setEncryptionKey("");
  setChallengeId(null);
  setWalletAddress("");
  setStep(1);

  // Reset Circle SDK iframe/session cleanly
  window.location.reload();
};


 const onSdkResult = async (error: any, result: any) => {
   if (error) {
     console.error("Verification Error:", error);
     alert(error.message);
     return;
   }


   if (result) {
     const res = await fetch(`/api/auth/wallet?userToken=${userToken}`);
     const data = await res.json();


     if (data.address) {
       setWalletAddress(data.address);
       setStep(3);
     }
   }
 };


 /* -------------------------------------------------
    Verify OTP (SDK executes here)
 -------------------------------------------------- */
 const handleVerifyOTP = async (e: React.FormEvent) => {
   e.preventDefault();
    const sdk = sdkRef.current;
   if (!sdk) {
     alert("SDK not ready yet. Please try again.");
     return;
   }
    sdk.setAuthentication({ userToken, encryptionKey });
    if (challengeId) {
     // ENROLL
     sdk.execute(challengeId, onSdkResult);
   } else {
     // LOGIN (SDK typing workaround)
     (sdk.execute as unknown as (
       callback: (error: any, result: any) => void
     ) => void)(onSdkResult);
   }
 };


 /* -------------------------------------------------
    UI
 -------------------------------------------------- */
 return (
   <div className="flex min-h-screen items-center justify-center bg-zinc-50">
     <main className="w-full max-w-3xl p-16 bg-white">



       <h1 className="text-3xl font-semibold mt-8 text-gray-800">Circle OTP Integration with Firebase Auth </h1>


       <div className="mt-8 p-6 rounded-xl border text-gray-900">



         {step === 1 && (
           <>
             <input
               type="email"
               placeholder="Email"
               value={email}
               onChange={(e) => setEmail(e.target.value)}
               className="w-full p-2 border rounded mb-4 text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"

             />


             <button
               className="w-full bg-blue-600 text-white p-2 rounded mb-2"
               onClick={(e) => handleRequestOTP(e, "login")}
             >
               Sign In
             </button>


             <button
               className="w-full bg-green-600 text-white p-2 rounded"
               onClick={(e) => handleRequestOTP(e, "enroll")}
             >
               Create Wallet
             </button>
           </>
         )}


         {step === 2 && (
           <form onSubmit={handleVerifyOTP}>
             <p className="mb-2">
               Check your email for a one-time code.
             </p>


             <input
               type="text"
               maxLength={6}
               value={otpCode}
               onChange={(e) => setOtpCode(e.target.value)}
               className="w-full p-2 text-center text-2xl border rounded mb-4 text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"

             />


             <button
               type="submit"
               className="w-full bg-green-600 text-white p-2 rounded"
             >
               Verify & Access Wallet
             </button>
           </form>
         )}


{step === 3 && (
  <div className="flex flex-col gap-4">
    <h2 className="font-bold text-green-600">Wallet Active</h2>

    <div className="font-mono break-all p-2 border rounded">
      {walletAddress}
    </div>

    <button
  onClick={() => {
    setEmail("");
    setUserToken("");
    setEncryptionKey("");
    setChallengeId(null);
    setWalletAddress("");
    setStep(1);
  }}
  className="mt-4 w-full bg-zinc-700 text-white p-2 rounded"
>
  Log Out
</button>

  </div>
)}

       </div>
     </main>
   </div>
 );
}