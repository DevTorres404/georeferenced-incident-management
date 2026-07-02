<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bienvenido a SGI</title>
    <style>
        body, table, td, a {
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
        }

        table, td {
            mso-table-lspace: 0pt;
            mso-table-rspace: 0pt;
        }

        img {
            -ms-interpolation-mode: bicubic;
            border: 0;
            height: auto;
            line-height: 100%;
            outline: none;
            text-decoration: none;
        }

        body {
            width: 100% !important;
            margin: 0;
            padding: 0;
            background-color: #f4f7fb;
            color: #0f172a;
            font-family: Arial, Helvetica, sans-serif;
            -webkit-font-smoothing: antialiased;
        }

        .wrapper {
            width: 100%;
            padding: 36px 16px;
            background-color: #071827;
        }

        .email-container {
            width: 100%;
            max-width: 640px;
            margin: 0 auto;
            overflow: hidden;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            background-color: #ffffff;
        }

        .header {
            padding: 34px 40px 30px;
            color: #ffffff;
            background-color: #071827;
        }

        .brand-table {
            width: 100%;
            border-spacing: 0;
        }

        .brand-mark {
            display: inline-block;
            width: 52px;
            height: 52px;
            border-radius: 8px;
            background-color: #ffffff;
            color: #0369a1;
            font-size: 18px;
            font-weight: 700;
            line-height: 52px;
            text-align: center;
        }

        .brand-name {
            padding-left: 14px;
            color: #cbd5e1;
            font-size: 13px;
            line-height: 19px;
            vertical-align: middle;
        }

        .brand-name strong {
            display: block;
            color: #ffffff;
            font-size: 18px;
            line-height: 23px;
        }

        .header h1 {
            margin: 30px 0 10px;
            color: #ffffff;
            font-size: 28px;
            font-weight: 700;
            line-height: 35px;
            letter-spacing: 0;
        }

        .header p {
            max-width: 500px;
            margin: 0;
            color: #cbd5e1;
            font-size: 15px;
            line-height: 24px;
        }

        .accent-line {
            height: 4px;
            background-color: #0ea5e9;
            line-height: 4px;
        }

        .content {
            padding: 34px 40px 30px;
            background-color: #ffffff;
        }

        .content p {
            margin: 0 0 18px;
            color: #475569;
            font-size: 15px;
            line-height: 24px;
        }

        .content strong {
            color: #0f172a;
        }

        .info-box {
            margin: 26px 0;
            padding: 18px 20px;
            border: 1px solid #e2e8f0;
            border-left: 4px solid #0ea5e9;
            border-radius: 8px;
            background-color: #f8fafc;
        }

        .info-box p {
            margin: 0;
            color: #334155;
            font-size: 14px;
            line-height: 22px;
        }

        .button-wrap {
            margin: 30px 0 28px;
            text-align: center;
        }

        .button {
            display: inline-block;
            padding: 14px 30px;
            border-radius: 8px;
            background-color: #0ea5e9;
            color: #ffffff !important;
            font-size: 15px;
            font-weight: 700;
            line-height: 18px;
            text-decoration: none;
        }

        .steps {
            width: 100%;
            margin-top: 8px;
            border-spacing: 0;
        }

        .step {
            padding: 14px 0 0;
            vertical-align: top;
        }

        .step-number {
            width: 30px;
            height: 30px;
            border-radius: 50%;
            background-color: #e0f2fe;
            color: #0369a1;
            font-size: 13px;
            font-weight: 700;
            line-height: 30px;
            text-align: center;
        }

        .step-text {
            padding-left: 12px;
            color: #475569;
            font-size: 14px;
            line-height: 21px;
        }

        .footer {
            padding: 28px 40px 34px;
            border-top: 1px solid #e2e8f0;
            background-color: #f8fafc;
            text-align: center;
        }

        .footer p {
            margin: 0 0 10px;
            color: #64748b;
            font-size: 12px;
            line-height: 18px;
        }

        .footer-link {
            color: #0369a1;
            font-size: 12px;
            line-height: 18px;
            text-decoration: underline;
            word-break: break-all;
        }

        @media screen and (max-width: 600px) {
            .wrapper {
                padding: 0;
            }

            .email-container {
                border-right: 0;
                border-left: 0;
                border-radius: 0;
            }

            .header,
            .content,
            .footer {
                padding-right: 24px;
                padding-left: 24px;
            }

            .header h1 {
                font-size: 24px;
                line-height: 31px;
            }
        }
    </style>
</head>
<body>
    @php
        $displayName = $notifiable->nombre
            ?? $notifiable->name
            ?? $notifiable->username
            ?? 'Usuario';
    @endphp

    <table class="wrapper" width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
            <td align="center">
                <table class="email-container" cellpadding="0" cellspacing="0" role="presentation">
                    <tr>
                        <td class="header">
                            <table class="brand-table" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                    <td width="52">
                                        <span class="brand-mark">SGI</span>
                                    </td>
                                    <td class="brand-name">
                                        <strong>Sistema de Gestión de Incidencias</strong>
                                        Gestión ciudadana georreferenciada
                                    </td>
                                </tr>
                            </table>

                            <h1>Bienvenido a SGI</h1>
                            <p>Tu cuenta ya está lista para registrar, consultar y dar seguimiento a incidencias desde una plataforma segura.</p>
                        </td>
                    </tr>

                    <tr>
                        <td class="accent-line">&nbsp;</td>
                    </tr>

                    <tr>
                        <td class="content">
                            <p>Hola <strong>{{ $displayName }}</strong>,</p>
                            <p>Gracias por unirte al sistema. Desde ahora puedes acceder a las opciones disponibles según tu rol y participar en el seguimiento de reportes de tu comunidad.</p>

                            <div class="info-box">
                                <p>Por seguridad, ingresa siempre desde el enlace oficial del sistema y mantén actualizados tus datos de perfil.</p>
                            </div>

                            <div class="button-wrap">
                                <a href="{{ $url }}" class="button">Entrar al sistema</a>
                            </div>

                            <table class="steps" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                    <td class="step" width="30">
                                        <div class="step-number">1</div>
                                    </td>
                                    <td class="step step-text">Accede con tu cuenta registrada.</td>
                                </tr>
                                <tr>
                                    <td class="step" width="30">
                                        <div class="step-number">2</div>
                                    </td>
                                    <td class="step step-text">Revisa las acciones disponibles para tu rol.</td>
                                </tr>
                                <tr>
                                    <td class="step" width="30">
                                        <div class="step-number">3</div>
                                    </td>
                                    <td class="step step-text">Crea, consulta o da seguimiento a las incidencias autorizadas.</td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td class="footer">
                            <p>&copy; {{ date('Y') }} SGI. Todos los derechos reservados.</p>
                            <p>Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
                            <a href="{{ $url }}" class="footer-link">{{ $url }}</a>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
