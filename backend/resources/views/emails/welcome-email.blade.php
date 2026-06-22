<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bienvenido a GIC</title>
    <!-- Outfit font fallback -->
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
        
        body {
            margin: 0;
            padding: 0;
            width: 100% !important;
            background-color: #f8f9fa;
            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #212529;
            -webkit-font-smoothing: antialiased;
        }
        
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
            margin-top: 40px;
            margin-bottom: 40px;
            border: 1px solid #f1f3f5;
        }

        .header {
            padding: 40px 40px 20px 40px;
            text-align: center;
        }

        .brand-logo {
            display: inline-block;
            background-color: #f8f9fa;
            width: 48px;
            height: 48px;
            border-radius: 12px;
            line-height: 48px;
            text-align: center;
            font-size: 24px;
            font-weight: bold;
            color: #212529;
            border: 1px solid #e9ecef;
            margin-bottom: 16px;
        }

        .content {
            padding: 0 40px 40px 40px;
            text-align: center;
        }

        h1 {
            font-size: 24px;
            font-weight: 600;
            margin: 0 0 16px 0;
            color: #212529;
            letter-spacing: -0.5px;
        }

        p {
            font-size: 15px;
            line-height: 1.6;
            margin: 0 0 24px 0;
            color: #495057;
        }

        .btn-wrapper {
            margin: 32px 0;
        }

        .btn {
            display: inline-block;
            padding: 14px 32px;
            background-color: #1a1d20;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 500;
            font-size: 15px;
            letter-spacing: 0.2px;
            transition: background-color 0.2s;
        }

        .btn:hover {
            background-color: #000000;
        }

        .footer {
            padding: 32px 40px;
            text-align: center;
            background-color: #f8f9fa;
            border-top: 1px solid #f1f3f5;
        }

        .footer p {
            font-size: 13px;
            color: #868e96;
            margin: 0 0 8px 0;
        }

        .footer-link {
            color: #868e96;
            text-decoration: underline;
            word-break: break-all;
            font-size: 12px;
        }

        @media screen and (max-width: 600px) {
            .email-container {
                margin-top: 20px;
                margin-bottom: 20px;
                border-radius: 0;
                border-left: none;
                border-right: none;
            }
            .header, .content, .footer {
                padding-left: 24px;
                padding-right: 24px;
            }
        }
    </style>
</head>
<body>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f8f9fa">
        <tr>
            <td align="center">
                <!--[if mso]>
                <table width="600" cellpadding="0" cellspacing="0" border="0"><tr><td>
                <![endif]-->
                <div class="email-container">
                    
                    <div class="header">
                        <div class="brand-logo">GIC</div>
                    </div>

                    <div class="content">
                        <h1>¡Bienvenido a GIC!</h1>
                        <p>Hola {{ $notifiable->nombre ?? 'Usuario' }},</p>
                        <p>Gracias por unirte al Sistema de Incidencias Ciudadanas. Tu cuenta ha sido creada exitosamente. Ahora puedes comenzar a reportar incidencias y hacer seguimiento de tu comunidad.</p>
                        
                        <div class="btn-wrapper">
                            <a href="{{ $url }}" class="btn">Ir al Dashboard</a>
                        </div>
                        
                        <p style="margin-bottom: 0;">Si tienes alguna pregunta, no dudes en contactarnos.</p>
                    </div>

                    <div class="footer">
                        <p>&copy; {{ date('Y') }} GIC. Todos los derechos reservados.</p>
                        <p>Si tienes problemas haciendo clic en el botón, copia y pega este enlace en tu navegador:</p>
                        <a href="{{ $url }}" class="footer-link">{{ $url }}</a>
                    </div>

                </div>
                <!--[if mso]>
                </td></tr></table>
                <![endif]-->
            </td>
        </tr>
    </table>
</body>
</html>
