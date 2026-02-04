import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userToken = searchParams.get('userToken');
  const API_KEY = process.env.CIRCLE_API_KEY;

  if (!userToken) {
    return NextResponse.json({ error: "Missing userToken" }, { status: 400 });
  }

  try {
    // We ask Circle to list the wallets for this specific user session
    const response = await fetch('https://api.circle.com/v1/w3s/wallets', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'X-User-Token': userToken
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to fetch wallets");
    }

    // This grabs the first wallet address from the list for the display
    const walletAddress = data.data?.wallets[0]?.address;

    return NextResponse.json({ address: walletAddress });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

}

