<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bienvenido a GIC</title>
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
            background-color: #f8fbff;
            color: #1f2937;
            font-family: Arial, Helvetica, sans-serif;
            -webkit-font-smoothing: antialiased;
        }

        .wrapper {
            width: 100%;
            background-color: #001f3f;
            background:
                linear-gradient(135deg, rgba(0, 31, 63, 0.96) 0%, rgba(0, 123, 255, 0.88) 58%, rgba(23, 162, 184, 0.86) 100%);
            padding: 38px 16px;
        }

        .email-container {
            width: 100%;
            max-width: 620px;
            margin: 0 auto;
            overflow: hidden;
            border: 1px solid rgba(0, 31, 63, 0.12);
            border-radius: 8px;
            background-color: #ffffff;
            box-shadow: 0 18px 45px rgba(0, 31, 63, 0.22);
        }

        .header {
            padding: 34px 40px 28px;
            color: #ffffff;
            background-color: #001f3f;
            background:
                linear-gradient(135deg, #001f3f 0%, #007bff 68%, #17a2b8 100%);
        }

        .brand-row {
            display: table;
            width: 100%;
        }

        .brand-mark {
            display: inline-block;
            width: 54px;
            height: 54px;
            border: 1px solid rgba(255, 255, 255, 0.22);
            border-radius: 8px;
            background-color: rgba(255, 255, 255, 0.14);
            color: #ffffff;
            font-size: 20px;
            font-weight: 700;
            line-height: 54px;
            text-align: center;
        }

        .brand-name {
            padding-left: 14px;
            color: rgba(255, 255, 255, 0.86);
            font-size: 13px;
            line-height: 18px;
            vertical-align: middle;
        }

        .brand-name strong {
            display: block;
            color: #ffffff;
            font-size: 17px;
            line-height: 22px;
        }

        .header h1 {
            margin: 28px 0 10px;
            color: #ffffff;
            font-size: 27px;
            font-weight: 700;
            line-height: 34px;
            letter-spacing: 0;
        }

        .header p {
            max-width: 480px;
            margin: 0;
            color: rgba(255, 255, 255, 0.88);
            font-size: 15px;
            line-height: 23px;
        }

        .content {
            padding: 34px 40px 28px;
            background-color: #ffffff;
        }

        .content p {
            margin: 0 0 18px;
            color: #465568;
            font-size: 15px;
            line-height: 24px;
        }

        .content strong {
            color: #001f3f;
        }

        .summary-card {
            margin: 26px 0;
            padding: 18px 20px;
            border: 1px solid rgba(0, 31, 63, 0.14);
            border-left: 4px solid #007bff;
            border-radius: 8px;
            background-color: #f8fbff;
        }

        .summary-card p {
            margin: 0;
            color: #334155;
            font-size: 14px;
            line-height: 22px;
        }

        .button-wrap {
            margin: 30px 0 26px;
            text-align: center;
        }

        .button {
            display: inline-block;
            padding: 14px 30px;
            border-radius: 8px;
            background: #007bff;
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
            background-color: #e3f2ff;
            color: #007bff;
            font-size: 13px;
            font-weight: 700;
            line-height: 30px;
            text-align: center;
        }

        .step-text {
            padding-left: 12px;
            color: #465568;
            font-size: 14px;
            line-height: 21px;
        }

        .footer {
            padding: 28px 40px 34px;
            border-top: 1px solid #e5edf6;
            background-color: #f8fbff;
            text-align: center;
        }

        .footer p {
            margin: 0 0 10px;
            color: #64748b;
            font-size: 12px;
            line-height: 18px;
        }

        .footer-link {
            color: #007bff;
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
                            <table class="brand-row" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                    <td width="54">
                                        <span class="brand-mark">GIC</span>
                                    </td>
                                    <td class="brand-name">
                                        <strong>Gestion de Incidencias</strong>
                                        Sistema ciudadano georreferenciado
                                    </td>
                                </tr>
                            </table>

                            <h1>Bienvenido a GIC</h1>
                            <p>Tu cuenta ya esta lista para reportar, consultar y hacer seguimiento de incidencias ciudadanas.</p>
                        </td>
                    </tr>

                    <tr>
                        <td class="content">
                            <p>Hola <strong>{{ $displayName }}</strong>,</p>
                            <p>Gracias por unirte al sistema. Desde ahora puedes registrar incidencias, consultar su estado y participar en el seguimiento de los reportes de tu comunidad.</p>

                            <div class="summary-card">
                                <p>Para comenzar, entra al panel principal y revisa las opciones disponibles segun tu rol asignado.</p>
                            </div>

                            <div class="button-wrap">
                                <a href="{{ $url }}" class="button">Ir al panel principal</a>
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
                                    <td class="step step-text">Crea o consulta incidencias desde el panel.</td>
                                </tr>
                                <tr>
                                    <td class="step" width="30">
                                        <div class="step-number">3</div>
                                    </td>
                                    <td class="step step-text">Haz seguimiento del avance y las actualizaciones.</td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td class="footer">
                            <p>&copy; {{ date('Y') }} GIC. Todos los derechos reservados.</p>
                            <p>Si el boton no funciona, copia y pega este enlace en tu navegador:</p>
                            <a href="{{ $url }}" class="footer-link">{{ $url }}</a>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
