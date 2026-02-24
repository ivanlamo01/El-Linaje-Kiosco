'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    FaArrowLeft,
    FaShieldAlt,
    FaCheckCircle,
    FaDownload,
    FaKey,
    FaCertificate,
    FaExclamationTriangle,
} from 'react-icons/fa';
import {
    setupAfipProduction,
    downloadCertificate,
    AuthWebServiceProductionData,
} from '@/app/lib/afipCertification';

export default function AfipCertificationPage() {
    const [formData, setFormData] = useState<AuthWebServiceProductionData>({
        cuit: '',
        username: '',
        password: '',
        alias: 'afipsdk',
        service: 'wsfe',
    });

    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{
        certificate?: { cert: string; key: string };
        authorization?: { status: string };
        error?: string;
    } | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setResult(null);

        try {
            const response = await setupAfipProduction(formData);
            setResult({
                certificate: response.certificate,
                authorization: response.authorization,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Error al procesar la solicitud';
            setResult({
                error: message,
            });
            console.error("Detalle del error:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = () => {
        if (result?.certificate) {
            downloadCertificate(
                result.certificate.cert,
                result.certificate.key,
                formData.alias
            );
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8 mt-20">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <Link
                        href="/admin"
                        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
                    >
                        <FaArrowLeft className="w-4 h-4" />
                        Volver al Panel
                    </Link>
                    <h1 className="text-3xl font-bold text-gray-800">Certificación AFIP - Producción</h1>
                    <p className="text-gray-600 mt-2">
                        Genera y autoriza certificados de producción para web services de AFIP
                    </p>
                </div>

                {/* Main Form Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
                    <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center">
                                <FaShieldAlt className="text-white text-xl" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-800">Nuevo Certificado</h2>
                                <p className="text-sm text-gray-600">Completá los datos para generar el certificado</p>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* CUIT */}
                            <div>
                                <label htmlFor="cuit" className="block text-sm font-medium text-gray-700 mb-2">
                                    CUIT <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    id="cuit"
                                    name="cuit"
                                    value={formData.cuit}
                                    onChange={handleChange}
                                    required
                                    placeholder="20111111112"
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                />
                            </div>

                            {/* Username */}
                            <div>
                                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                                    Usuario (CUIT) <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    id="username"
                                    name="username"
                                    value={formData.username}
                                    onChange={handleChange}
                                    required
                                    placeholder="20111111112"
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                />
                            </div>

                            {/* Password */}
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                                    Contraseña de AFIP <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="password"
                                    id="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    required
                                    placeholder="••••••••"
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                />
                            </div>

                            {/* Alias */}
                            <div>
                                <label htmlFor="alias" className="block text-sm font-medium text-gray-700 mb-2">
                                    Alias del Certificado <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    id="alias"
                                    name="alias"
                                    value={formData.alias}
                                    onChange={handleChange}
                                    required
                                    placeholder="afipsdk"
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                />
                            </div>

                            {/* Service */}
                            <div className="md:col-span-2">
                                <label htmlFor="service" className="block text-sm font-medium text-gray-700 mb-2">
                                    Web Service <span className="text-red-500">*</span>
                                </label>
                                <select
                                    id="service"
                                    name="service"
                                    value={formData.service}
                                    onChange={handleChange}
                                    required
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white"
                                >
                                    <option value="wsfe">WSFE - Facturación Electrónica</option>
                                    <option value="wsfev1">WSFEv1 - Facturación Electrónica v1</option>
                                    <option value="wsmtxca">WSMTXCA - Monotributo</option>
                                </select>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="mt-8">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <svg
                                            className="animate-spin h-5 w-5 text-white"
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                        >
                                            <circle
                                                className="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                strokeWidth="4"
                                            ></circle>
                                            <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                            ></path>
                                        </svg>
                                        Procesando...
                                    </>
                                ) : (
                                    <>
                                        <FaCertificate />
                                        Generar Certificado y Autorizar
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Result Display */}
                {result && (
                    <div className={`rounded-2xl shadow-sm border overflow-hidden mb-6 animate-in fade-in ${result.error ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                        }`}>
                        <div className="p-6">
                            {result.error ? (
                                <div>
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                                            <FaExclamationTriangle className="text-red-600" />
                                        </div>
                                        <h3 className="font-bold text-lg text-red-800">Error al procesar</h3>
                                    </div>
                                    <p className="text-red-700">{result.error}</p>
                                </div>
                            ) : (
                                <div>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                                            <FaCheckCircle className="text-green-600" />
                                        </div>
                                        <h3 className="font-bold text-lg text-green-800">¡Certificado generado exitosamente!</h3>
                                    </div>

                                    {result.certificate && (
                                        <div className="bg-white rounded-xl p-4 border border-green-200 mb-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <FaKey className="text-green-600" />
                                                <h4 className="font-semibold text-gray-800">Certificado Creado</h4>
                                            </div>
                                            <button
                                                onClick={handleDownload}
                                                className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                            >
                                                <FaDownload />
                                                Descargar Certificado y Clave Privada
                                            </button>
                                        </div>
                                    )}

                                    {result.authorization && (
                                        <div className="bg-white rounded-xl p-4 border border-green-200">
                                            <div className="flex items-center gap-2 mb-2">
                                                <FaCheckCircle className="text-green-600" />
                                                <h4 className="font-semibold text-gray-800">Web Service Autorizado</h4>
                                            </div>
                                            <p className="text-gray-700">
                                                Estado: <span className="font-semibold text-green-700">{result.authorization.status}</span>
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Instructions Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50">
                        <h2 className="text-xl font-bold text-gray-800">📋 Instrucciones</h2>
                    </div>
                    <div className="p-6">
                        <ol className="list-decimal list-inside space-y-3 text-gray-700">
                            <li>Asegúrate de tener credenciales válidas de AFIP (CUIT y contraseña)</li>
                            <li>Selecciona el web service que deseas autorizar</li>
                            <li>Completa el formulario con tus datos</li>
                            <li>Haz clic en &quot;Generar Certificado y Autorizar&quot;</li>
                            <li>Descarga el certificado (.crt) y la clave privada (.key)</li>
                            <li>Guarda los archivos en un lugar seguro</li>
                        </ol>

                        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                            <div className="flex gap-3">
                                <FaExclamationTriangle className="text-yellow-600 mt-0.5" />
                                <div>
                                    <p className="text-yellow-800 text-sm font-medium mb-1">Importante - Seguridad</p>
                                    <p className="text-yellow-700 text-sm">
                                        Guarda los archivos del certificado en un lugar seguro.
                                        Nunca compartas tu clave privada (.key) públicamente.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
