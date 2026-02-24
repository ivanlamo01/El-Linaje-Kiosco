import { NextRequest, NextResponse } from 'next/server';
import { getAfipAdminClient } from '@/app/lib/afip';

export async function POST(req: NextRequest) {
    try {
        // Verificar que el usuario tenga permisos de administrador
        // Aquí deberías agregar tu lógica de autenticación

        const body = await req.json();
        const { cuit, username, password, alias, service } = body;

        // Validar datos requeridos
        if (!cuit || !username || !password || !alias || !service) {
            return NextResponse.json(
                { error: 'Faltan datos requeridos: cuit, username, password, alias, service' },
                { status: 400 }
            );
        }

        // Inicializar AFIP SDK con el CUIT específico
        const afip = getAfipAdminClient(parseInt(cuit));

        // Datos para autorizar el web service de producción
        const data = {
            cuit: parseInt(cuit), // CAMPO OBLIGATORIO para la automatización
            username,
            password,
            alias,
            service,
            environment: 'prod'
        };

        // Ejecutar la automatización
        const response = await afip.CreateAutomation('auth-web-service-prod', data, true);

        // Verificar que la respuesta sea exitosa
        if (response.status === 'complete' && response.data) {
            return NextResponse.json({
                success: true,
                message: `Web service ${service} autorizado exitosamente`,
                data: response.data,
            });
        } else {
            return NextResponse.json(
                {
                    error: 'Error al autorizar el web service',
                    details: response
                },
                { status: 500 }
            );
        }

    } catch (error: unknown) {
        console.error('Error al autorizar web service de producción:', error);
        
        // El SDK de AFIP devuelve el error en error.data cuando usa sus interceptores
        const err = error as { data?: unknown; response?: { data?: unknown }; message?: string; status?: number };
        const errorDetails = err.data || err.response?.data || err.message || error;
        console.error('Detalles del error AFIP SDK (FULL):', JSON.stringify(errorDetails, null, 2));

        return NextResponse.json(
            {
                error: 'Error al autorizar el web service de producción',
                details: errorDetails
            },
            { status: err.status || 500 }
        );
    }
}
