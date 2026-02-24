import { NextResponse } from 'next/server';

export async function GET() {
    const accessToken = process.env.AFIP_SDK_ACCESS_TOKEN;

    return NextResponse.json({
        hasAccessToken: !!accessToken,
        tokenLength: accessToken?.length || 0,
        tokenPreview: accessToken ? `${accessToken.substring(0, 10)}...` : 'NOT_FOUND',
        allAfipVars: {
            AFIP_CUIT: !!process.env.AFIP_CUIT,
            AFIP_PASSWORD: !!process.env.AFIP_PASSWORD,
            AFIP_SDK_ACCESS_TOKEN: !!process.env.AFIP_SDK_ACCESS_TOKEN,
        }
    });
}
